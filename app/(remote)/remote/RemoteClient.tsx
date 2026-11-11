"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  PHONE_AT_MARK_BUTTON,
  PHONE_CONNECTED,
  PHONE_CONNECTING,
  phoneGoToMark,
  PHONE_POSITION_FAILED,
} from "@/lib/acuity/autoStart";
import { DIRECTION_BUTTON_LABELS, PHONE_NOT_SURE } from "@/lib/acuity/landoltWording";
import type { LandoltDirection } from "@/lib/acuity/landoltStaircase";
import {
  PHONE_LINK_INCOMPLETE,
  PHONE_POSITION_RESET,
  PHONE_RECONNECTING,
  PHONE_SENDING,
  PHONE_SESSION_ENDED,
  PHONE_STILL_WAITING,
  PHONE_TRY_AGAIN,
} from "@/lib/acuity/flowWording";
import type { SloanLetter } from "@/lib/acuity/sloan";
import {
  PHONE_CAMERA_NOTICE,
  PHONE_CAMERA_RESTART_BUTTON,
  PHONE_CAMERA_UNAVAILABLE,
  PHONE_HOLD_INSTRUCTION,
  PHONE_STATUS_GO_BACK,
  PHONE_STATUS_LOST,
} from "@/lib/movement/wording";
import { useSessionStore } from "@/lib/session/useSessionStore";
import { phoneLookAtScreen, phonePrompt, phoneWaitingLine } from "./remoteView";
import {
  answer,
  bootstrap,
  confirmPosition,
  disposeRemote,
  getServerSnapshot,
  getSnapshot,
  restartMovementCamera,
  retryFailed,
  subscribe,
  watchRemote,
  type RemoteSnapshot,
} from "./remoteController";

type Props = {
  sessionId: string | null;
};

function choiceButtonClass(
  selected: boolean,
  dimOthers: boolean,
  variant: "letter" | "not_sure",
): string {
  const base =
    "min-h-16 rounded-lg text-3xl font-semibold transition-colors disabled:cursor-not-allowed";
  if (variant === "not_sure") {
    if (selected) {
      return `${base} border-2 border-sky-400 bg-neutral-800 text-xl font-medium text-neutral-100`;
    }
    if (dimOthers) {
      return `${base} border border-neutral-600 bg-neutral-900 text-xl font-medium text-neutral-100 opacity-40`;
    }
    return `${base} border border-neutral-600 bg-neutral-900 text-xl font-medium text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700`;
  }
  if (selected) {
    return `${base} bg-sky-200 text-neutral-900`;
  }
  if (dimOthers) {
    return `${base} bg-neutral-100 text-neutral-900 opacity-40`;
  }
  return `${base} bg-neutral-100 text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300`;
}

/** Same colours and busy, selected and dimmed states as the letter buttons; at least 88 by 88 CSS px. */
function directionButtonClass(selected: boolean, dimOthers: boolean): string {
  const base =
    "flex min-h-[88px] min-w-[88px] items-center justify-center rounded-lg px-1 text-xl font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed";
  if (selected) {
    return `${base} bg-sky-200 text-neutral-900`;
  }
  if (dimOthers) {
    return `${base} bg-neutral-100 text-neutral-900 opacity-40`;
  }
  return `${base} bg-neutral-100 text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300`;
}

/** Fixed cross: Up top centre, Left and Right in the middle row, Down bottom centre. */
const DIRECTION_CELLS: readonly { direction: LandoltDirection; cell: string }[] = [
  { direction: "up", cell: "col-start-2 row-start-1" },
  { direction: "left", cell: "col-start-1 row-start-2" },
  { direction: "right", cell: "col-start-3 row-start-2" },
  { direction: "down", cell: "col-start-2 row-start-3" },
];

/** Phases after the tap in which the phone's own camera status is shown. */
const MOVEMENT_STATUS_PHASES: ReadonlySet<string> = new Set(["at_mark", "waiting", "choosing", "sent", "send_failed"]);

/** Movement detection only: the phone's camera status. Renders nothing with the switch off. */
function MovementStatus({ snap }: { snap: RemoteSnapshot }) {
  if (snap.movement === null || !MOVEMENT_STATUS_PHASES.has(snap.phase)) {
    return null;
  }
  const status = snap.movement.status;
  if (status === "needs-restart") {
    return (
      <div className="px-4 pt-2">
        <button
          type="button"
          onClick={() => {
            restartMovementCamera();
          }}
          className="min-h-14 w-full rounded-lg bg-amber-600 px-6 text-lg font-medium text-white hover:bg-amber-500 active:bg-amber-400"
        >
          {PHONE_CAMERA_RESTART_BUTTON}
        </button>
      </div>
    );
  }
  let line: string | null = null;
  if (status === "lost") {
    line = PHONE_STATUS_LOST;
  } else if (status === "go-back") {
    line = PHONE_STATUS_GO_BACK;
  } else if (status === "unavailable") {
    line = PHONE_CAMERA_UNAVAILABLE;
  }
  return (
    <p
      role="status"
      aria-live="polite"
      className={`min-h-7 px-4 pt-2 text-center text-lg font-medium ${status === "unavailable" ? "text-neutral-300" : "text-amber-300"}`}
    >
      {line ?? ""}
    </p>
  );
}

function StillWaitingLine({ show }: { show: boolean }) {
  return (
    <p className="min-h-6 text-neutral-400" aria-live="polite">
      {show ? PHONE_STILL_WAITING : ""}
    </p>
  );
}

export default function RemoteClient({ sessionId }: Props) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    return () => {
      disposeRemote();
    };
  }, []);

  useEffect(() => {
    if (sessionId === null) {
      return;
    }
    void bootstrap(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (snap.sessionId !== null && snap.phase !== "not_found" && snap.phase !== "loading") {
      watchRemote(snap.sessionId);
    }
  }, [snap.sessionId, snap.phase]);

  return (
    <>
      <p role="status" className="min-h-5 px-4 pt-3 text-center text-sm text-neutral-400">
        {snap.reconnecting ? PHONE_RECONNECTING : ""}
      </p>
      <MovementStatus snap={snap} />
      <RemoteScreen sessionId={sessionId} snap={snap} />
    </>
  );
}

function RemoteScreen({ sessionId, snap }: { sessionId: string | null; snap: RemoteSnapshot }) {
  const session = useSessionStore();

  if (sessionId === null) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-neutral-400">{PHONE_LINK_INCOMPLETE}</p>
      </main>
    );
  }

  if (snap.phase === "loading" || snap.phase === "connect") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-neutral-300" aria-live="polite">
          {PHONE_CONNECTING}
        </p>
      </main>
    );
  }

  if (snap.phase === "not_found") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-neutral-400">{PHONE_SESSION_ENDED}</p>
      </main>
    );
  }

  if (snap.phase === "error") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-red-400">
          {snap.errorMessage ??
            "Something went wrong connecting to the main screen. Reload this page to try again."}
        </p>
        <button
          type="button"
          onClick={() => {
            void bootstrap(sessionId);
          }}
          className="min-h-14 w-full max-w-sm rounded-lg bg-sky-600 px-6 text-lg font-medium text-white hover:bg-sky-500 active:bg-sky-400"
        >
          {PHONE_TRY_AGAIN}
        </button>
      </main>
    );
  }

  if (snap.phase === "go_to_mark") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-lg text-emerald-400">{PHONE_CONNECTED}</p>
        {snap.positionReset && (
          <p className="text-lg leading-relaxed text-neutral-100">{PHONE_POSITION_RESET}</p>
        )}
        <p className="text-lg leading-relaxed text-neutral-200">
          {phoneGoToMark(snap.distanceMmRequested)}
        </p>
        {snap.movement !== null && (
          <p className="text-lg leading-relaxed text-neutral-200">{PHONE_HOLD_INSTRUCTION}</p>
        )}
        <div className="flex w-full max-w-sm flex-col gap-2">
          <button
            type="button"
            disabled={snap.positionSending}
            aria-busy={snap.positionSending}
            onClick={() => {
              void confirmPosition();
            }}
            className="min-h-14 w-full rounded-lg bg-sky-600 px-6 text-lg font-medium text-white hover:bg-sky-500 active:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {snap.positionSending ? PHONE_SENDING : PHONE_AT_MARK_BUTTON}
          </button>
          {snap.movement !== null && (
            <p className="text-base leading-relaxed text-neutral-300">{PHONE_CAMERA_NOTICE}</p>
          )}
          <p className="min-h-12 text-red-400" aria-live="polite">
            {snap.positionFailed ? PHONE_POSITION_FAILED : ""}
          </p>
        </div>
      </main>
    );
  }

  if (snap.phase === "at_mark") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-lg text-emerald-400">{PHONE_CONNECTED}</p>
        <p className="text-lg leading-relaxed text-neutral-200">
          {phoneLookAtScreen(snap.testMode)}
        </p>
        {snap.testMode === "landolt" && snap.eyeLine !== null && (
          <p className="text-lg font-bold leading-relaxed text-neutral-100">{snap.eyeLine}</p>
        )}
        <StillWaitingLine show={snap.stillWaiting} />
      </main>
    );
  }

  if (snap.phase === "complete") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-lg text-emerald-400">{"Test complete. Your result is on the main screen. Keep this page open if you’d like to test again."}</p>
      </main>
    );
  }

  if (snap.phase === "waiting" || snap.phase === "sent") {
    const waitingLine = phoneWaitingLine(snap.testMode, snap.everSawTrial);
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        {snap.lastSentLabel !== null && (
          <p className="text-neutral-200">{`Answer sent: ${snap.lastSentLabel}`}</p>
        )}
        <p className="text-neutral-300">{waitingLine}</p>
        <StillWaitingLine show={snap.stillWaiting} />
      </main>
    );
  }

  if (snap.phase === "send_failed") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-red-400">
          {snap.errorMessage ??
            "Something went wrong sending your answer. Tap to try again."}
        </p>
        <button
          type="button"
          disabled={snap.choiceLocked}
          onClick={() => {
            void retryFailed();
          }}
          className="min-h-14 w-full max-w-sm rounded-lg bg-amber-600 px-6 text-lg font-medium text-white hover:bg-amber-500 active:bg-amber-400"
        >
          {snap.choiceLocked ? PHONE_SENDING : "Tap to retry"}
        </button>
      </main>
    );
  }

  const presentationId = snap.presentationId;
  const entry =
    presentationId === null ? undefined : session.responses[presentationId];
  const disabled =
    snap.choiceLocked ||
    entry?.state === "pending" ||
    entry?.state === "sent";
  const selected = snap.selectedChoice;
  const dimOthers = selected !== null;
  const sending = snap.choiceLocked && snap.selectedChoice !== null;

  if (snap.testMode === "landolt") {
    const notSureSelected = selected !== null && selected.kind === "direction_not_sure";
    return (
      <main className="flex flex-1 flex-col gap-3 px-4 py-6">
        <p className="text-center text-sm text-neutral-400">{phonePrompt("landolt", snap.practice)}</p>
        <p className="min-h-5 text-center text-sm text-neutral-200" aria-live="polite">
          {sending ? "Sending your answer…" : ""}
        </p>
        <div className="mx-auto grid w-full max-w-sm grid-cols-3 grid-rows-3 gap-3">
          {DIRECTION_CELLS.map(({ direction, cell }) => {
            const isSelected =
              selected !== null && selected.kind === "direction" && selected.direction === direction;
            return (
              <button
                key={direction}
                type="button"
                disabled={disabled}
                onClick={() => {
                  void answer({ kind: "direction", direction });
                }}
                className={`${cell} ${directionButtonClass(isSelected, dimOthers && !isSelected)}`}
              >
                {DIRECTION_BUTTON_LABELS[direction]}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            void answer({ kind: "direction_not_sure" });
          }}
          className={`mx-auto w-full max-w-sm ${choiceButtonClass(
            notSureSelected,
            dimOthers && !notSureSelected,
            "not_sure",
          )}`}
        >
          {PHONE_NOT_SURE}
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-3 px-4 py-6">
      <p className="text-center text-sm text-neutral-400">
        Which letter do you see?
      </p>
      <p
        className="text-center text-sm text-neutral-200 min-h-5"
        aria-live="polite"
      >
        {sending ? "Sending your answer…" : ""}
      </p>
      <div className="grid grid-cols-1 gap-3">
        {snap.choices.map((letter: SloanLetter) => {
          const isSelected =
            selected !== null &&
            selected.kind === "letter" &&
            selected.letter === letter;
          return (
            <button
              key={letter}
              type="button"
              disabled={disabled}
              onClick={() => {
                void answer({ kind: "letter", letter });
              }}
              className={choiceButtonClass(isSelected, dimOthers && !isSelected, "letter")}
            >
              {letter}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            void answer({ kind: "not_sure" });
          }}
          className={choiceButtonClass(
            selected !== null && selected.kind === "not_sure",
            dimOthers && !(selected !== null && selected.kind === "not_sure"),
            "not_sure",
          )}
        >
          Not sure
        </button>
      </div>
    </main>
  );
}
