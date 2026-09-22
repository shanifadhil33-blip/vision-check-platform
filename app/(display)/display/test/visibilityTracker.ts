/**
 * Tracks document visibility for the active trial and appends
 * visibility_change events. No React. Owned by testController.
 */

import type { Json } from "@/lib/db/types";
import * as sessionStore from "@/lib/session/sessionStore";

type VisibilityState = "hidden" | "visible";

type BufferedChange = {
  state: VisibilityState;
  at: string;
  msSinceTrialStart: number;
};

let listening = false;
let trialIndex: number | null = null;
let presentationId: string | null = null;
let trialStartedAtMs = 0;
let buffer: BufferedChange[] = [];
let sendChain: Promise<void> = Promise.resolve();
let onVisibilityChange: (() => void) | null = null;

function readState(): VisibilityState {
  return document.visibilityState === "visible" ? "visible" : "hidden";
}

function enqueueSend(presId: string, tIndex: number, record: BufferedChange): void {
  sendChain = sendChain
    .then(async () => {
      const payload: Json = {
        presentation_id: presId,
        trial_index: tIndex,
        state: record.state,
        at: record.at,
        ms_since_trial_start: record.msSinceTrialStart,
      };
      const result = await sessionStore.appendEvent({
        type: "visibility_change",
        payload,
      });
      if (!result.ok) {
        console.error("visibility_change append failed", result.error);
      }
    })
    .catch((err: unknown) => {
      console.error("visibility_change append failed", err);
    });
}

function handleVisibilityChange(): void {
  if (!listening || trialIndex === null) {
    return;
  }
  const record: BufferedChange = {
    state: readState(),
    at: new Date().toISOString(),
    msSinceTrialStart: Math.round(Date.now() - trialStartedAtMs),
  };
  if (presentationId === null) {
    buffer.push(record);
    return;
  }
  enqueueSend(presentationId, trialIndex, record);
}

/** Stop any active listener, then start for this trial. */
export function startVisibilityTracking(nextTrialIndex: number): void {
  stopVisibilityTracking();
  trialIndex = nextTrialIndex;
  presentationId = null;
  buffer = [];
  trialStartedAtMs = Date.now();
  listening = true;
  onVisibilityChange = handleVisibilityChange;
  document.addEventListener("visibilitychange", onVisibilityChange);
}

/** Flush the buffer, then send later changes as they happen. */
export function setVisibilityPresentationId(id: string): void {
  if (!listening || trialIndex === null) {
    return;
  }
  presentationId = id;
  const toFlush = buffer;
  buffer = [];
  for (const record of toFlush) {
    enqueueSend(id, trialIndex, record);
  }
}

/**
 * Remove the listener. Buffered changes with no presentation id are dropped.
 * In-flight sends are left to finish; they do not block the trial loop.
 */
export function stopVisibilityTracking(): void {
  if (onVisibilityChange !== null) {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    onVisibilityChange = null;
  }
  listening = false;
  buffer = [];
  presentationId = null;
  trialIndex = null;
}
