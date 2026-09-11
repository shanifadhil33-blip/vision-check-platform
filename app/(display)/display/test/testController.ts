import type { Calibration } from "@/lib/calibration";
import { mmToCssPx, pixelPitchMm } from "@/lib/calibration";
import {
  letterHeightMmForLogMar,
  strokeWidthMmForLogMar,
} from "@/lib/acuity/logmar";
import {
  buildTrialChoices,
  pickTarget,
  renderableStepIndices,
} from "@/lib/acuity/thinLoop";
import type { SloanLetter } from "@/lib/acuity/sloan";
import type { PresentationPayload } from "@/lib/db/payloads";
import type { OptotypeMeasurement } from "@/app/(display)/display/optotype/OptotypeCanvas";
import { joinSessionChannel, type SessionChannel } from "@/lib/session/channel";
import {
  awaitingResponseState,
  completeState,
  parseLoopState,
  readyState,
} from "@/lib/session/loopState";
import * as sessionStore from "@/lib/session/sessionStore";

export type TestPhase =
  | "idle"
  | "creating"
  | "waiting_for_phone"
  | "ready"
  | "presenting"
  | "awaiting_response"
  | "complete"
  | "error";

export type CompletedTrial = {
  trialIndex: number;
  stepIndex: number;
  target: SloanLetter;
  responseKind: "letter" | "not_sure";
  responseLetter: SloanLetter | null;
  correct: boolean;
};

export type TestSnapshot = {
  phase: TestPhase;
  distanceMm: number | null;
  sessionId: string | null;
  remoteUrl: string | null;
  qrDataUrl: string | null;
  currentTrialIndex: number | null;
  currentStepIndex: number | null;
  currentTarget: SloanLetter | null;
  cssPxPerMm: number | null;
  devicePixelRatio: number | null;
  history: readonly CompletedTrial[];
  errorMessage: string | null;
};

type ActiveTrial = {
  trialIndex: number;
  stepIndex: number;
  target: SloanLetter;
  choices: SloanLetter[];
  presentationId: string | null;
  recorded: boolean;
};

const POLL_MS = 3000;
const CLIENT_BUILD = "thin-loop-9-10";

const SERVER_SNAPSHOT: TestSnapshot = {
  phase: "idle",
  distanceMm: null,
  sessionId: null,
  remoteUrl: null,
  qrDataUrl: null,
  currentTrialIndex: null,
  currentStepIndex: null,
  currentTarget: null,
  cssPxPerMm: null,
  devicePixelRatio: null,
  history: [],
  errorMessage: null,
};

const listeners = new Set<() => void>();
let cachedSnapshot: TestSnapshot = SERVER_SNAPSHOT;

let calibration: Calibration | null = null;
let stepIndices: number[] = [];
let activeTrial: ActiveTrial | null = null;
let history: CompletedTrial[] = [];
let channel: SessionChannel | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;
let startInFlight = false;
let beginInFlight = false;
let measureInFlight = false;
let advanceInFlight = false;
let disposed = false;

function emit(next: TestSnapshot): void {
  cachedSnapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function patch(partial: Partial<TestSnapshot>): void {
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

export function getSnapshot(): TestSnapshot {
  return cachedSnapshot;
}

export function getServerSnapshot(): TestSnapshot {
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

/**
 * Advance only after a vcp_get_session read shows phase 'responded'
 * for the current presentation id.
 */
async function tryAdvanceFromResponded(): Promise<void> {
  if (disposed || advanceInFlight) {
    return;
  }
  if (cachedSnapshot.phase !== "awaiting_response") {
    return;
  }
  const trial = activeTrial;
  if (trial === null || trial.presentationId === null) {
    return;
  }

  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null) {
    return;
  }

  advanceInFlight = true;
  try {
    const loaded = await sessionStore.loadSession(sessionId);
    if (!loaded.ok || disposed) {
      return;
    }
    if (cachedSnapshot.phase !== "awaiting_response") {
      return;
    }
    if (activeTrial !== trial || trial.presentationId === null) {
      return;
    }

    const state = parseLoopState(loaded.data.currentState);
    if (state === null || state.phase !== "responded") {
      return;
    }
    if (state.presentationId !== trial.presentationId) {
      return;
    }

    const correct =
      state.responseKind === "letter" && state.responseLetter === trial.target;
    history = [
      ...history,
      {
        trialIndex: trial.trialIndex,
        stepIndex: trial.stepIndex,
        target: trial.target,
        responseKind: state.responseKind,
        responseLetter: state.responseLetter,
        correct,
      },
    ];
    patch({ history });

    const nextIndex = trial.trialIndex + 1;
    activeTrial = null;

    if (nextIndex >= stepIndices.length) {
      const done = await sessionStore.setState("complete", completeState(history.length));
      if (!done.ok) {
        fail(done.error.message);
        return;
      }
      if (channel !== null) {
        await channel.sendNudge("complete");
      }
      patch({
        phase: "complete",
        currentTrialIndex: null,
        currentStepIndex: null,
        currentTarget: null,
        history,
      });
      return;
    }

    await presentTrialAt(nextIndex);
  } finally {
    advanceInFlight = false;
  }
}

async function onSessionNudgeOrPoll(): Promise<void> {
  if (disposed) {
    return;
  }
  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null) {
    return;
  }

  const loaded = await sessionStore.loadSession(sessionId);
  if (!loaded.ok || disposed) {
    return;
  }

  const uiPhase = cachedSnapshot.phase;
  if (
    (uiPhase === "waiting_for_phone" || uiPhase === "creating") &&
    loaded.data.status === "paired"
  ) {
    patch({ phase: "ready", errorMessage: null });
  }

  await tryAdvanceFromResponded();
}

/** Channel + poll. Called from TestClient useEffect when sessionId appears. */
export function watchSession(sessionId: string): void {
  if (disposed) {
    return;
  }
  if (channel === null) {
    channel = joinSessionChannel(sessionId, () => {
      void onSessionNudgeOrPoll();
    });
  }
  if (pollTimer === null) {
    pollTimer = setInterval(() => {
      if (pollInFlight || disposed) {
        return;
      }
      pollInFlight = true;
      void onSessionNudgeOrPoll().finally(() => {
        pollInFlight = false;
      });
    }, POLL_MS);
  }
}

async function presentTrialAt(trialIndex: number): Promise<void> {
  if (disposed) {
    return;
  }
  const stepIndex = stepIndices[trialIndex];
  if (stepIndex === undefined || calibration === null) {
    fail("No trial steps available for this distance and screen.");
    return;
  }

  const target = pickTarget(Math.random);
  const choices = buildTrialChoices(target, Math.random);
  activeTrial = {
    trialIndex,
    stepIndex,
    target,
    choices,
    presentationId: null,
    recorded: false,
  };

  patch({
    phase: "presenting",
    currentTrialIndex: trialIndex,
    currentStepIndex: stepIndex,
    currentTarget: target,
    errorMessage: null,
  });
}

/**
 * Stable onMeasured identity. Accepts a measurement only for the active
 * presenting trial that has not been recorded yet.
 */
export function handleCanvasMeasured(measurement: OptotypeMeasurement): void {
  void acceptMeasurement(measurement);
}

async function acceptMeasurement(measurement: OptotypeMeasurement): Promise<void> {
  if (disposed || measureInFlight) {
    return;
  }
  if (cachedSnapshot.phase !== "presenting") {
    return;
  }
  const trial = activeTrial;
  if (trial === null || trial.recorded) {
    return;
  }
  if (calibration === null || cachedSnapshot.distanceMm === null) {
    return;
  }
  if (measurement.inkBounds === null) {
    fail("The letter could not be measured on this screen.");
    return;
  }

  measureInFlight = true;
  try {
    if (
      disposed ||
      cachedSnapshot.phase !== "presenting" ||
      activeTrial !== trial ||
      trial.recorded
    ) {
      return;
    }

    const distanceMm = cachedSnapshot.distanceMm;
    const logMar = trial.stepIndex / 10;
    const letterHeightMm = letterHeightMmForLogMar(logMar, distanceMm);
    const strokeWidthMm = strokeWidthMmForLogMar(logMar, distanceMm);
    const letterHeightCssPx = mmToCssPx(letterHeightMm, calibration.cssPxPerMm);
    const letterHeightDevicePx = letterHeightCssPx * calibration.devicePixelRatio;

    const payload: PresentationPayload = {
      trial_index: trial.trialIndex,
      eye: "both",
      logmar_step_index: trial.stepIndex,
      requested_letter_height_mm: letterHeightMm,
      requested_stroke_width_mm: strokeWidthMm,
      requested_letter_height_css_px: letterHeightCssPx,
      requested_letter_height_device_px: letterHeightDevicePx,
      optotypes: [trial.target],
      target_index: 0,
      format: "single",
      distance_mm_requested: distanceMm,
      actual_letter_height_device_px: measurement.inkBounds.heightPx,
      rendered_at: new Date().toISOString(),
      visibility_confirmed: document.visibilityState === "visible",
    };

    if (trial.target === "H" && measurement.strokeWidthDevicePx !== null) {
      payload.actual_stroke_width_device_px = measurement.strokeWidthDevicePx;
    }

    trial.recorded = true;
    const recorded = await sessionStore.recordPresentation(payload);
    if (!recorded.ok) {
      trial.recorded = false;
      fail(recorded.error.message);
      return;
    }

    if (
      disposed ||
      activeTrial !== trial ||
      cachedSnapshot.phase !== "presenting"
    ) {
      return;
    }

    trial.presentationId = recorded.data;

    const eventResult = await sessionStore.appendEvent({
      type: "choices_offered",
      payload: {
        presentation_id: recorded.data,
        choices: [...trial.choices],
      },
    });
    if (!eventResult.ok) {
      fail(eventResult.error.message);
      return;
    }

    const stateResult = await sessionStore.setState(
      "running",
      awaitingResponseState({
        trialIndex: trial.trialIndex,
        presentationId: recorded.data,
        choices: trial.choices,
      }),
    );
    if (!stateResult.ok) {
      fail(stateResult.error.message);
      return;
    }

    if (channel !== null) {
      await channel.sendNudge("awaiting_response");
    }

    patch({ phase: "awaiting_response" });
  } finally {
    measureInFlight = false;
  }
}

export async function start(
  distanceMm: number,
  nextCalibration: Calibration,
): Promise<void> {
  if (startInFlight) {
    return;
  }
  if (cachedSnapshot.phase !== "idle" && cachedSnapshot.phase !== "error") {
    return;
  }

  startInFlight = true;
  disposed = false;
  leaveChannel();
  stopPoll();
  activeTrial = null;
  history = [];
  calibration = nextCalibration;
  stepIndices = renderableStepIndices(
    distanceMm,
    pixelPitchMm(nextCalibration.cssPxPerMm, nextCalibration.devicePixelRatio),
  );

  patch({
    phase: "creating",
    distanceMm,
    sessionId: null,
    remoteUrl: null,
    qrDataUrl: null,
    currentTrialIndex: null,
    currentStepIndex: null,
    currentTarget: null,
    cssPxPerMm: nextCalibration.cssPxPerMm,
    devicePixelRatio: nextCalibration.devicePixelRatio,
    history: [],
    errorMessage: null,
  });

  try {
    sessionStore.reset();
    const created = await sessionStore.createSession({
      distanceMmRequested: distanceMm,
      clientBuild: CLIENT_BUILD,
    });
    if (!created.ok) {
      fail(created.error.message);
      return;
    }

    const attached = await sessionStore.attachCalibration(nextCalibration);
    if (!attached.ok) {
      fail(attached.error.message);
      return;
    }

    const ready = await sessionStore.setState("created", readyState());
    if (!ready.ok) {
      fail(ready.error.message);
      return;
    }

    const sessionId = created.data.id;
    const remoteUrl = `${window.location.origin}/remote?session=${sessionId}`;
    const qrcode = await import("qrcode");
    const qrDataUrl = await qrcode.toDataURL(remoteUrl, { margin: 1, width: 280 });

    patch({
      phase: "waiting_for_phone",
      sessionId,
      remoteUrl,
      qrDataUrl,
    });
  } finally {
    startInFlight = false;
  }
}

export async function beginTrials(): Promise<void> {
  if (beginInFlight) {
    return;
  }
  if (cachedSnapshot.phase !== "ready") {
    return;
  }
  if (stepIndices.length === 0) {
    fail("No renderable steps for this distance and screen.");
    return;
  }

  beginInFlight = true;
  try {
    const session = sessionStore.getSnapshot();
    if (session.status !== "paired" && session.status !== "running") {
      fail("Phone is not paired yet.");
      return;
    }
    if (session.status === "paired") {
      const running = await sessionStore.setState("running", readyState());
      if (!running.ok) {
        fail(running.error.message);
        return;
      }
      if (channel !== null) {
        await channel.sendNudge("running");
      }
    }
    await presentTrialAt(0);
  } finally {
    beginInFlight = false;
  }
}

export function dispose(): void {
  disposed = true;
  stopPoll();
  leaveChannel();
  startInFlight = false;
  beginInFlight = false;
  measureInFlight = false;
  advanceInFlight = false;
  activeTrial = null;
  history = [];
  calibration = null;
  stepIndices = [];
  sessionStore.reset();
  emit({ ...SERVER_SNAPSHOT });
}
