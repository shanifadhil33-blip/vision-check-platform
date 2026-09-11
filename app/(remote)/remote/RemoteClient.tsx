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
          className="min-h-14 w-full max-w-sm rounded-lg bg-sky-600 px-6 text-lg font-medium text-white active:bg-sky-500"
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
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-neutral-300">
          {snap.phase === "sent" ? "Answer sent. Waiting for the next letter…" : "Waiting for the next letter…"}
        </p>
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
          className="min-h-14 w-full max-w-sm rounded-lg bg-amber-600 px-6 text-lg font-medium text-white active:bg-amber-500"
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

  return (
    <main className="flex flex-1 flex-col gap-3 px-4 py-6">
      <p className="text-center text-sm text-neutral-400">
        Which letter do you see?
      </p>
      <div className="grid grid-cols-1 gap-3">
        {snap.choices.map((letter: SloanLetter) => (
          <button
            key={letter}
            type="button"
            disabled={disabled}
            onClick={() => {
              void answer({ kind: "letter", letter });
            }}
            className="min-h-16 rounded-lg bg-neutral-100 text-3xl font-semibold text-neutral-900 disabled:opacity-40"
          >
            {letter}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            void answer({ kind: "not_sure" });
          }}
          className="min-h-16 rounded-lg border border-neutral-600 bg-neutral-900 text-xl font-medium text-neutral-100 disabled:opacity-40"
        >
          Not sure
        </button>
      </div>
    </main>
  );
}
