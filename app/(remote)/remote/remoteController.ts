import type { SloanLetter } from "@/lib/acuity/sloan";
import type { ResponseChoice } from "@/lib/db/payloads";
import { joinSessionChannel, type SessionChannel } from "@/lib/session/channel";
import {
  parseLoopState,
  respondedState,
  type LoopState,
} from "@/lib/session/loopState";
import * as sessionStore from "@/lib/session/sessionStore";

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
};

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

function fail(message: string): void {
  patch({ phase: "error", errorMessage: message });
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
      patch({ phase: "not_found", errorMessage: loaded.error.message });
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
      patch({ phase: "not_found", errorMessage: loaded.error.message });
      return;
    }
    fail(loaded.error.message);
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
      fail(result.error.message);
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

async function writeRespondedOnce(
  presentationId: string,
  trialIndex: number,
  responseId: string,
  choice: ResponseChoice,
): Promise<boolean> {
  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null) {
    return false;
  }

  const kind = choice.kind === "letter" ? "letter" : "not_sure";
  const letter = choice.kind === "letter" ? choice.letter : null;

  const attempt = async (): Promise<"ok" | "conflict" | "fail"> => {
    const reloaded = await sessionStore.loadSession(sessionId);
    if (!reloaded.ok) {
      if (reloaded.error.kind === "stale-read") {
        return "conflict";
      }
      return "fail";
    }
    const state = parseLoopState(reloaded.data.currentState);
    if (
      state === null ||
      state.phase !== "awaiting_response" ||
      state.presentationId !== presentationId
    ) {
      return "fail";
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
    return "fail";
  };

  const first = await attempt();
  if (first === "ok") {
    return true;
  }
  if (first === "conflict") {
    const second = await attempt();
    return second === "ok";
  }
  return false;
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
  patch({ choiceLocked: true });

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
        patch({
          phase: "send_failed",
          choiceLocked: false,
          errorMessage: submitted.error.message,
        });
        return;
      }

      if (submitted.data.state !== "sent" || submitted.data.responseId === null) {
        patch({
          phase: "send_failed",
          choiceLocked: false,
          errorMessage: "Response not confirmed.",
        });
        return;
      }
      sentEntry = submitted.data;
    }

    if (sentEntry.responseId === null) {
      patch({
        phase: "send_failed",
        choiceLocked: false,
        errorMessage: "Response not confirmed.",
      });
      return;
    }

    const wrote = await writeRespondedOnce(
      presentationId,
      trialIndex,
      sentEntry.responseId,
      sentEntry.choice,
    );
    if (!wrote) {
      patch({
        phase: "send_failed",
        choiceLocked: false,
        errorMessage: "Answer saved but not confirmed to the laptop. Tap to retry.",
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
