"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { SloanLetter } from "@/lib/acuity/sloan";
import { useSessionStore } from "@/lib/session/useSessionStore";
import {
  answer,
  bootstrap,
  connect,
  disposeRemote,
  getServerSnapshot,
  getSnapshot,
  retryFailed,
  subscribe,
  watchRemote,
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

export default function RemoteClient({ sessionId }: Props) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const session = useSessionStore();

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

  if (sessionId === null) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-neutral-400">Missing or invalid session link.</p>
      </main>
    );
  }

  if (snap.phase === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-neutral-400">Loading session…</p>
      </main>
    );
  }

  if (snap.phase === "not_found") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-neutral-400">Session not found.</p>
      </main>
    );
  }

  if (snap.phase === "error") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-red-400">{snap.errorMessage ?? "Something went wrong."}</p>
      </main>
    );
  }

  if (snap.phase === "connect") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        <p className="text-center text-neutral-300">Ready to join this vision check.</p>
        <button
          type="button"
          onClick={() => {
            void connect();
          }}
          className="min-h-14 w-full max-w-sm rounded-lg bg-sky-600 px-6 text-lg font-medium text-white hover:bg-sky-500 active:bg-sky-400"
        >
          Connect
        </button>
      </main>
    );
  }

  if (snap.phase === "complete") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-lg text-emerald-400">Test complete. You can put the phone down.</p>
      </main>
    );
  }

  if (snap.phase === "waiting" || snap.phase === "sent") {
    const waitingLine = snap.everSawTrial
      ? "Waiting for the next letter…"
      : "Connected. Waiting for the first letter…";
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        {snap.lastSentLabel !== null && (
          <p className="text-neutral-200">{`Answer sent: ${snap.lastSentLabel}`}</p>
        )}
        <p className="text-neutral-300">{waitingLine}</p>
      </main>
    );
  }

  if (snap.phase === "send_failed") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-red-400">{snap.errorMessage ?? "Send failed."}</p>
        <button
          type="button"
          onClick={() => {
            void retryFailed();
          }}
          className="min-h-14 w-full max-w-sm rounded-lg bg-amber-600 px-6 text-lg font-medium text-white hover:bg-amber-500 active:bg-amber-400"
        >
          Tap to retry
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

  return (
    <main className="flex flex-1 flex-col gap-3 px-4 py-6">
      <p className="text-center text-sm text-neutral-400">
        Which letter do you see?
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
