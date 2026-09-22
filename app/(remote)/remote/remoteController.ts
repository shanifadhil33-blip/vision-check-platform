import type { SloanLetter } from "@/lib/acuity/sloan";
import type { VcpError, VcpErrorKind } from "@/lib/db/errors";
import type { ResponseChoice } from "@/lib/db/payloads";
import { joinSessionChannel, type SessionChannel } from "@/lib/session/channel";
import {
  parseLoopState,
  respondedState,
  type LoopState,
} from "@/lib/session/loopState";
import * as sessionStore from "@/lib/session/sessionStore";

type PhoneErrorContext = "answer" | "connect";

const MSG_SESSION_ENDED =
  "This test has ended on the main screen. Scan the new code there to start again.";

function phoneErrorMessage(kind: VcpErrorKind, context: PhoneErrorContext): string {
  if (kind === "network" || kind === "submission-in-flight") {
    return context === "answer"
      ? "Couldn't send your answer. Check your connection and tap to try again."
      : "Couldn't connect to the main screen. Check your connection, then reload this page.";
  }
  if (kind === "session-not-found") {
    return MSG_SESSION_ENDED;
  }
  return context === "answer"
    ? "Something went wrong sending your answer. Tap to try again."
    : "Something went wrong connecting to the main screen. Reload this page to try again.";
}

export type RemoteUiPhase =
  | "loading"
  | "not_found"
  | "connect"
  | "waiting"
  | "choosing"
  | "sent"
  | "send_failed"
  | "complete"
  | "error";

export type RemoteSnapshot = {
  phase: RemoteUiPhase;
  sessionId: string | null;
  choices: readonly SloanLetter[];
  presentationId: string | null;
  trialIndex: number | null;
  errorMessage: string | null;
  choiceLocked: boolean;
  /** True once the phone has shown at least one choice set. */
  everSawTrial: boolean;
  /** Label for the last confirmed answer ("N" or "Not sure"); never right/wrong. */
  lastSentLabel: string | null;
  /** Immediate tap highlight while sending. */
  selectedChoice: ResponseChoice | null;
};

const POLL_MS = 3000;

const SERVER_SNAPSHOT: RemoteSnapshot = {
  phase: "loading",
  sessionId: null,
  choices: [],
  presentationId: null,
  trialIndex: null,
  errorMessage: null,
  choiceLocked: false,
  everSawTrial: false,
  lastSentLabel: null,
  selectedChoice: null,
};

function sentLabel(choice: ResponseChoice): string {
  if (choice.kind === "not_sure") {
    return "Not sure";
  }
  return choice.letter;
}

const listeners = new Set<() => void>();
let cachedSnapshot: RemoteSnapshot = SERVER_SNAPSHOT;

let channel: SessionChannel | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;
let connectInFlight = false;
let answerInFlight = false;
let disposed = false;
let choicesShownAtMs: number | null = null;
let lastHandledPresentationId: string | null = null;

function emit(next: RemoteSnapshot): void {
  cachedSnapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function patch(partial: Partial<RemoteSnapshot>): void {
  emit({
    ...cachedSnapshot,
    ...partial,
  });
}

function failWithError(error: VcpError, context: PhoneErrorContext): void {
  console.error(error);
  patch({ phase: "error", errorMessage: phoneErrorMessage(error.kind, context) });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): RemoteSnapshot {
  return cachedSnapshot;
}

export function getServerSnapshot(): RemoteSnapshot {
  return SERVER_SNAPSHOT;
}

function stopPoll(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollInFlight = false;
}

function leaveChannel(): void {
  if (channel !== null) {
    channel.leave();
    channel = null;
  }
}

function applyLoopState(state: LoopState | null, status: string | null): void {
  if (status === "complete" || (state !== null && state.phase === "complete")) {
    patch({
      phase: "complete",
      choices: [],
      presentationId: null,
      trialIndex: null,
      choiceLocked: false,
      errorMessage: null,
    });
    return;
  }

  if (state !== null && state.phase === "awaiting_response") {
    const isNew = state.presentationId !== lastHandledPresentationId;
    if (isNew || cachedSnapshot.phase !== "choosing") {
      if (isNew) {
        choicesShownAtMs = Date.now();
        lastHandledPresentationId = state.presentationId;
      }
      patch({
        phase: "choosing",
        choices: state.choices,
        presentationId: state.presentationId,
        trialIndex: state.trialIndex,
        choiceLocked: false,
        errorMessage: null,
        everSawTrial: true,
        lastSentLabel: null,
        selectedChoice: null,
      });
    }
    return;
  }

  if (state !== null && state.phase === "responded") {
    if (cachedSnapshot.phase === "choosing" || cachedSnapshot.phase === "sent") {
      patch({
        phase: "waiting",
        choices: [],
        presentationId: null,
        trialIndex: null,
        choiceLocked: false,
      });
    }
    return;
  }

  if (
    cachedSnapshot.phase === "connect" ||
    cachedSnapshot.phase === "loading" ||
    cachedSnapshot.phase === "waiting" ||
    cachedSnapshot.phase === "sent"
  ) {
    if (status === "paired" || status === "running") {
      patch({
        phase: "waiting",
        choices: [],
        presentationId: null,
        trialIndex: null,
        choiceLocked: false,
        errorMessage: null,
      });
    }
  }
}

async function refreshFromServer(): Promise<void> {
  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null || disposed) {
    return;
  }
  const loaded = await sessionStore.loadSession(sessionId);
  if (!loaded.ok) {
    if (loaded.error.kind === "session-not-found") {
      console.error(loaded.error);
      patch({ phase: "not_found", errorMessage: MSG_SESSION_ENDED });
      return;
    }
    return;
  }
  if (disposed) {
    return;
  }
  applyLoopState(parseLoopState(loaded.data.currentState), loaded.data.status);
}

async function pollOnce(): Promise<void> {
  if (pollInFlight || disposed) {
    return;
  }
  pollInFlight = true;
  try {
    await refreshFromServer();
  } finally {
    pollInFlight = false;
  }
}

/** Channel + poll. Called from RemoteClient useEffect. */
export function watchRemote(sessionId: string): void {
  if (disposed) {
    return;
  }
  if (channel === null) {
    channel = joinSessionChannel(sessionId, () => {
      void refreshFromServer();
    });
  }
  if (pollTimer === null) {
    pollTimer = setInterval(() => {
      void pollOnce();
    }, POLL_MS);
  }
}

export async function bootstrap(sessionId: string): Promise<void> {
  disposed = false;
  patch({
    phase: "loading",
    sessionId,
    choices: [],
    presentationId: null,
    trialIndex: null,
    errorMessage: null,
    choiceLocked: false,
  });

  sessionStore.reset();
  const loaded = await sessionStore.loadSession(sessionId);
  if (!loaded.ok) {
    if (loaded.error.kind === "session-not-found") {
      console.error(loaded.error);
      patch({ phase: "not_found", errorMessage: MSG_SESSION_ENDED });
      return;
    }
    failWithError(loaded.error, "connect");
    return;
  }

  if (loaded.data.status === "created") {
    patch({ phase: "connect", errorMessage: null });
    return;
  }

  applyLoopState(parseLoopState(loaded.data.currentState), loaded.data.status);
  if (cachedSnapshot.phase === "loading") {
    patch({ phase: "waiting", errorMessage: null });
  }
}

export async function connect(): Promise<void> {
  if (connectInFlight) {
    return;
  }
  if (cachedSnapshot.phase !== "connect") {
    return;
  }
  const session = sessionStore.getSnapshot();
  if (session.status !== "created") {
    return;
  }

  connectInFlight = true;
  try {
    const result = await sessionStore.pair();
    if (!result.ok) {
      failWithError(result.error, "connect");
      return;
    }
    patch({ phase: "waiting", errorMessage: null });
    if (channel !== null) {
      await channel.sendNudge("paired");
    }
  } finally {
    connectInFlight = false;
  }
}

type WriteRespondedResult =
  | { ok: true }
  | { ok: false; kind: VcpErrorKind; original: unknown };

async function writeRespondedOnce(
  presentationId: string,
  trialIndex: number,
  responseId: string,
  choice: ResponseChoice,
): Promise<WriteRespondedResult> {
  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null) {
    return { ok: false, kind: "no-session", original: "No session id" };
  }

  const kind = choice.kind === "letter" ? "letter" : "not_sure";
  const letter = choice.kind === "letter" ? choice.letter : null;

  const attempt = async (): Promise<
    "ok" | "conflict" | { failKind: VcpErrorKind; original: unknown }
  > => {
    const reloaded = await sessionStore.loadSession(sessionId);
    if (!reloaded.ok) {
      if (reloaded.error.kind === "stale-read") {
        return "conflict";
      }
      return { failKind: reloaded.error.kind, original: reloaded.error };
    }
    if (reloaded.data.status === "complete") {
      return { failKind: "session-not-found", original: reloaded.data };
    }
    const state = parseLoopState(reloaded.data.currentState);
    if (
      state === null ||
      state.phase !== "awaiting_response" ||
      state.presentationId !== presentationId
    ) {
      return {
        failKind: "unknown",
        original: { status: reloaded.data.status, state },
      };
    }
    const written = await sessionStore.setState(
      "running",
      respondedState({
        trialIndex,
        presentationId,
        responseId,
        responseKind: kind,
        responseLetter: letter,
      }),
    );
    if (written.ok) {
      return "ok";
    }
    if (written.error.kind === "version-conflict") {
      return "conflict";
    }
    return { failKind: written.error.kind, original: written.error };
  };

  const first = await attempt();
  if (first === "ok") {
    return { ok: true };
  }
  if (first === "conflict") {
    const second = await attempt();
    if (second === "ok") {
      return { ok: true };
    }
    if (second === "conflict") {
      return {
        ok: false,
        kind: "version-conflict",
        original: "version-conflict after retry",
      };
    }
    return { ok: false, kind: second.failKind, original: second.original };
  }
  return { ok: false, kind: first.failKind, original: first.original };
}

export async function answer(choice: ResponseChoice): Promise<void> {
  if (answerInFlight) {
    return;
  }
  if (cachedSnapshot.phase !== "choosing" && cachedSnapshot.phase !== "send_failed") {
    return;
  }
  const presentationId = cachedSnapshot.presentationId;
  const trialIndex = cachedSnapshot.trialIndex;
  if (presentationId === null || trialIndex === null) {
    return;
  }

  const existing = sessionStore.getSnapshot().responses[presentationId];
  if (existing !== undefined && existing.state === "pending") {
    return;
  }

  answerInFlight = true;
  patch({ choiceLocked: true, selectedChoice: choice });

  try {
    let sentEntry = existing !== undefined && existing.state === "sent" ? existing : null;

    if (sentEntry === null) {
      let latencyMs: number | null = null;
      if (choicesShownAtMs !== null) {
        latencyMs = Math.round(Date.now() - choicesShownAtMs);
      }

      const submitted = await sessionStore.submitResponse(
        presentationId,
        choice,
        latencyMs,
      );
      if (!submitted.ok) {
        console.error(submitted.error);
        patch({
          phase: "send_failed",
          choiceLocked: false,
          errorMessage: phoneErrorMessage(submitted.error.kind, "answer"),
        });
        return;
      }

      if (submitted.data.state !== "sent" || submitted.data.responseId === null) {
        console.error("Response not confirmed.", submitted.data);
        patch({
          phase: "send_failed",
          choiceLocked: false,
          errorMessage: phoneErrorMessage("unknown", "answer"),
        });
        return;
      }
      sentEntry = submitted.data;
    }

    if (sentEntry.responseId === null) {
      console.error("Response not confirmed.", sentEntry);
      patch({
        phase: "send_failed",
        choiceLocked: false,
        errorMessage: phoneErrorMessage("unknown", "answer"),
      });
      return;
    }

    const wrote = await writeRespondedOnce(
      presentationId,
      trialIndex,
      sentEntry.responseId,
      sentEntry.choice,
    );
    if (!wrote.ok) {
      console.error(wrote.original);
      patch({
        phase: "send_failed",
        choiceLocked: false,
        errorMessage: phoneErrorMessage(wrote.kind, "answer"),
      });
      return;
    }

    if (channel !== null) {
      await channel.sendNudge("responded");
    }
    patch({
      phase: "sent",
      choiceLocked: true,
      errorMessage: null,
      choices: [],
      lastSentLabel: sentLabel(sentEntry.choice),
      selectedChoice: null,
    });
  } finally {
    answerInFlight = false;
  }
}

export async function retryFailed(): Promise<void> {
  if (cachedSnapshot.phase !== "send_failed") {
    return;
  }
  const presentationId = cachedSnapshot.presentationId;
  if (presentationId === null) {
    return;
  }
  const entry = sessionStore.getSnapshot().responses[presentationId];
  if (entry === undefined) {
    return;
  }
  await answer(entry.choice);
}

export function disposeRemote(): void {
  disposed = true;
  stopPoll();
  leaveChannel();
  connectInFlight = false;
  answerInFlight = false;
  choicesShownAtMs = null;
  lastHandledPresentationId = null;
  sessionStore.reset();
  emit({ ...SERVER_SNAPSHOT });
}
