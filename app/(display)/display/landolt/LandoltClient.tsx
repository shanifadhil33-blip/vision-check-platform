"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCalibration } from "@/app/(display)/display/calibrate/useCalibration";
import { zoomSignal, type ZoomSignalState } from "@/lib/calibration";
import { CORRECTION_OPTIONS, WEARING_QUESTION } from "@/lib/acuity";
import {
  DEFAULT_TEST_DISTANCE_MM,
  distanceConfirmLabel,
  DISTANCE_HEADING,
  distanceInstruction,
  DISTANCE_PHONE_NOTE,
  SMALL_ROOM_LINK,
  TWO_M_NOTE,
  USE_3M_LINK,
} from "@/lib/acuity/distanceSetup";
import {
  BACK_TO_START,
  QR_ALT,
  SHOW_CODE_AGAIN,
  START_NEW_TEST,
  STOPPED_HEADING,
  stopReasonText,
} from "@/lib/acuity/flowWording";
import { mainGoToMark, MAIN_PHONE_CONNECTED } from "@/lib/acuity/autoStart";
import {
  eyeLabel,
  landoltDetailLines,
  landoltResultLine,
  landoltStartHint,
  landoltStartMessage,
  type LandoltStartHint,
} from "@/lib/acuity/landoltRun";
import {
  CHECKING_CALIBRATION,
  EYE_LABELS,
  EYE_QUESTION,
  INTERRUPTED_HEADING,
  INTERRUPTED_TEXT,
  LANDOLT_EYES,
  LANDOLT_PAGE_TITLE,
  LANDOLT_STAFF_LINE,
  PAIRING_INSTRUCTION,
  PRACTICE_LABEL,
  RESULT_HEADING,
  SETTING_UP,
  SET_UP_SCREEN_FIRST,
  SET_UP_SCREEN_LINK,
  SIZE_TABLE_HEADINGS,
  START_ANOTHER_TEST,
  WAITING_FOR_PHONE,
  eyeCoverInstruction,
  type LandoltEye,
} from "@/lib/acuity/landoltWording";
import type { RunContext } from "@/lib/session/loopState";
import { LandoltCanvas } from "./LandoltCanvas";
import {
  addressPopped,
  backToStart,
  checkSetupNow,
  closeReloadedSession,
  closeStraySession,
  dismissStartError,
  dispose,
  getServerSnapshot,
  getSnapshot,
  handleCanvasMeasured,
  leaveInterrupted,
  MSG_SESSION_CANNOT_CONTINUE,
  setSetupProbe,
  start,
  startAnotherTest,
  subscribe,
  watchSession,
} from "./landoltController";
import { isSessionUuid } from "./landoltSessionMemory";

const CORRECTION_CHOICES = ["none", "contacts", "glasses"] as const satisfies readonly RunContext["correction"][];

const CHECKING_TEXT_DELAY_MS = 300;
const SMALL_ROOM_DISTANCE_MM = 2000;

/* Classes copied from TestClient.tsx so both test pages look the same. */
const PRIMARY_LARGE_ACTION_CLASS =
  "inline-flex min-h-14 items-center justify-center rounded bg-sky-600 px-6 text-lg font-medium text-white hover:bg-sky-500";
const PRIMARY_ACTION_CLASS =
  "rounded bg-sky-600 px-4 py-3 text-base font-medium text-white hover:bg-sky-500";
const SECONDARY_ACTION_CLASS =
  "min-h-11 rounded border border-neutral-600 px-4 py-2 text-base font-medium text-neutral-100 hover:border-neutral-400";
const TEXT_ACTION_CLASS =
  "inline-flex min-h-11 items-center text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-200";

function focusOnMount(element: HTMLElement | null): void {
  element?.focus();
}

function optionClass(selected: boolean): string {
  const base =
    "w-full cursor-pointer rounded border px-4 py-3 text-left text-base has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-400";
  if (selected) {
    return `${base} border-sky-400 bg-sky-600 font-medium text-white`;
  }
  return `${base} border-neutral-600 bg-neutral-950 text-neutral-100 hover:border-neutral-400`;
}

/** One radio group in the start form's style. */
function ChoiceGroup<T extends string>({
  id,
  question,
  name,
  choices,
  labels,
  value,
  onChoose,
}: {
  id: string;
  question: string;
  name: string;
  choices: readonly T[];
  labels: Readonly<Record<T, string>>;
  value: T | null;
  onChoose: (choice: T) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-semibold text-neutral-100">
        {question}
      </h2>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-3">
        {choices.map((choice) => (
          <label key={choice} className={optionClass(value === choice)}>
            <input
              type="radio"
              name={name}
              value={choice}
              checked={value === choice}
              onChange={() => {
                onChoose(choice);
              }}
              className="sr-only"
            />
            {labels[choice]}
          </label>
        ))}
      </div>
    </section>
  );
}

export default function LandoltClient() {
  const { ready, calibration, validity } = useCalibration();
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [distanceMm, setDistanceMm] = useState(DEFAULT_TEST_DISTANCE_MM);
  const [distanceConfirmed, setDistanceConfirmed] = useState(false);
  const [eye, setEye] = useState<LandoltEye | null>(null);
  const [correction, setCorrection] = useState<RunContext["correction"] | null>(null);
  const [startHint, setStartHint] = useState<LandoltStartHint>(null);
  const [startPressCount, setStartPressCount] = useState(0);
  const [codeAgainSessionId, setCodeAgainSessionId] = useState<string | null>(null);
  const [checkingDelayPassed, setCheckingDelayPassed] = useState(false);
  const [leavingInterrupted, setLeavingInterrupted] = useState(false);
  const pairingInstructionRef = useRef<HTMLParagraphElement>(null);
  const startMessageRef = useRef<HTMLDivElement>(null);
  const mountCloseStarted = useRef(false);
  const validityOkRef = useRef(false);
  const zoomStateRef = useRef<ZoomSignalState>("unknown");
  const viewportWidthCssPxRef = useRef(0);
  const viewportHeightCssPxRef = useRef(0);

  if (codeAgainSessionId !== null && snap.phase !== "ready") {
    setCodeAgainSessionId(null);
  }

  let startMessage: string | null = null;
  if (snap.sessionId === null && (snap.phase === "idle" || snap.phase === "error")) {
    startMessage = landoltStartMessage(startHint, distanceMm);
    if (startMessage === null && snap.phase === "error" && snap.errorMessage !== null) {
      startMessage = snap.errorMessage;
    }
  }
  // Seeded with the first render's values so mount, and Strict Mode's second mount pass, never scroll.
  const lastStartMessageScrollRef = useRef({ message: startMessage, pressCount: startPressCount });

  const goBackToStart = useCallback((): void => {
    setEye(null);
    setCorrection(null);
    setStartHint(null);
    void backToStart();
  }, []);

  useEffect(() => {
    return () => {
      dispose();
    };
  }, []);

  useEffect(() => {
    function onPopState(): void {
      if (addressPopped() === "back-to-start") {
        goBackToStart();
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [goBackToStart]);

  useEffect(() => {
    if (mountCloseStarted.current) {
      return;
    }
    mountCloseStarted.current = true;
    const raw = new URLSearchParams(window.location.search).get("session");
    if (raw !== null && isSessionUuid(raw)) {
      // No resume on this page: a reload mid-test closes the session.
      closeReloadedSession(raw);
      return;
    }
    closeStraySession();
  }, []);

  useEffect(() => {
    const last = lastStartMessageScrollRef.current;
    lastStartMessageScrollRef.current = { message: startMessage, pressCount: startPressCount };
    if (startMessage === null) {
      return;
    }
    if (last.message === startMessage && last.pressCount === startPressCount) {
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    startMessageRef.current?.scrollIntoView({
      block: "end",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [startMessage, startPressCount]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCheckingDelayPassed(true);
    }, CHECKING_TEXT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (snap.phase === "waiting_for_phone") {
      pairingInstructionRef.current?.focus();
    }
  }, [snap.phase]);

  useEffect(() => {
    function syncProbeWindow(): void {
      validityOkRef.current = validity?.ok ?? false;
      zoomStateRef.current = zoomSignal(window.outerWidth, window.innerWidth).state;
      viewportWidthCssPxRef.current = window.innerWidth;
      viewportHeightCssPxRef.current = window.innerHeight;
    }

    syncProbeWindow();
    setSetupProbe(() => ({
      validityOk: validityOkRef.current,
      zoomState: zoomStateRef.current,
      viewportWidthCssPx: viewportWidthCssPxRef.current,
      viewportHeightCssPx: viewportHeightCssPxRef.current,
    }));
    checkSetupNow();

    function onResize(): void {
      syncProbeWindow();
      checkSetupNow();
    }

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      setSetupProbe(null);
    };
  }, [validity?.ok]);

  useEffect(() => {
    if (snap.sessionId !== null) {
      watchSession(snap.sessionId);
    }
  }, [snap.sessionId]);

  function switchDistance(nextDistanceMm: number): void {
    setDistanceMm(nextDistanceMm);
    setDistanceConfirmed(false);
    dismissStartError();
  }

  function pressStart(): void {
    setStartPressCount((count) => count + 1);
    const hint = landoltStartHint({ eye, correction, distanceConfirmed });
    setStartHint(hint);
    if (hint !== null || eye === null || correction === null || calibration === null) {
      return;
    }
    void start(
      { distanceMm, confirmed: distanceConfirmed },
      calibration,
      window.innerWidth,
      window.innerHeight,
      eye,
      correction,
    );
  }

  if (snap.phase === "interrupted") {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <h1 className="text-3xl font-semibold text-neutral-100">{INTERRUPTED_HEADING}</h1>
        <p className="text-xl leading-relaxed text-neutral-300">{INTERRUPTED_TEXT}</p>
        <button
          type="button"
          disabled={leavingInterrupted}
          aria-busy={leavingInterrupted}
          onClick={() => {
            // Waits for the reloaded session to finish closing before the start screen appears.
            setLeavingInterrupted(true);
            void leaveInterrupted().finally(() => {
              setLeavingInterrupted(false);
            });
          }}
          className={`${PRIMARY_LARGE_ACTION_CLASS} disabled:cursor-wait disabled:opacity-60`}
        >
          {leavingInterrupted ? SETTING_UP : START_NEW_TEST}
        </button>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-neutral-400">
        {checkingDelayPassed ? CHECKING_CALIBRATION : null}
      </main>
    );
  }

  if (snap.phase === "stopped" || (snap.phase === "error" && snap.sessionId !== null)) {
    const stopped = snap.phase === "stopped";
    const reasonText = stopped ? stopReasonText(snap.stopReason) : null;
    const setUpScreenAgain =
      stopped && (snap.stopReason === "calibration" || snap.stopReason === null);
    // No resume on this page, so an error never offers Refresh: a reload only ends the test.
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <p className="text-3xl font-semibold text-neutral-100">
          {stopped ? STOPPED_HEADING : (snap.errorMessage ?? MSG_SESSION_CANNOT_CONTINUE)}
        </p>
        {reasonText !== null && (
          <p className="text-2xl leading-relaxed text-neutral-300">{reasonText}</p>
        )}
        {setUpScreenAgain ? (
          <Link href="/display/calibrate" className={PRIMARY_LARGE_ACTION_CLASS}>
            {SET_UP_SCREEN_LINK}
          </Link>
        ) : (
          <button type="button" onClick={goBackToStart} className={PRIMARY_LARGE_ACTION_CLASS}>
            {START_NEW_TEST}
          </button>
        )}
      </main>
    );
  }

  if (snap.sessionId === null && (calibration === null || validity === null || !validity.ok)) {
    return (
      <main className="mx-auto flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-neutral-300">{SET_UP_SCREEN_FIRST}</p>
        <Link
          href="/display/calibrate"
          className="text-sky-400 underline underline-offset-4 hover:text-sky-300"
        >
          {SET_UP_SCREEN_LINK}
        </Link>
      </main>
    );
  }

  if (snap.phase === "countdown") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6">
        <p aria-live="polite" className="text-center text-9xl font-semibold text-neutral-100">
          {snap.countdownValue === null ? "" : `${snap.countdownValue}…`}
        </p>
        {snap.eye !== null && (
          <p className="text-center text-4xl font-semibold text-neutral-100">
            {eyeCoverInstruction(snap.eye)}
          </p>
        )}
      </main>
    );
  }

  if (
    (snap.phase === "presenting" || snap.phase === "awaiting_response") &&
    snap.currentDirection !== null &&
    snap.currentStepIndex !== null &&
    snap.currentTrialIndex !== null
  ) {
    const distance = snap.distanceMm;
    const cssPxPerMm = snap.cssPxPerMm ?? calibration?.cssPxPerMm ?? null;
    const devicePixelRatio = snap.devicePixelRatio ?? calibration?.devicePixelRatio ?? null;
    if (distance === null || cssPxPerMm === null || devicePixelRatio === null) {
      return (
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
          <p className="text-base text-neutral-300">{SETTING_UP}</p>
        </main>
      );
    }
    return (
      <main className="relative flex min-h-full flex-1 items-center justify-center bg-white">
        {!snap.currentPractice && snap.eye !== null && (
          <p className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-neutral-500">
            {eyeLabel(snap.eye)}
          </p>
        )}
        <div className="relative">
          {snap.currentPractice && (
            <p className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2 text-2xl font-semibold text-neutral-900">
              {PRACTICE_LABEL}
            </p>
          )}
          <LandoltCanvas
            key={snap.currentTrialIndex}
            trialIndex={snap.currentTrialIndex}
            direction={snap.currentDirection}
            stepIndex={snap.currentStepIndex}
            distanceMm={distance}
            cssPxPerMm={cssPxPerMm}
            devicePixelRatio={devicePixelRatio}
            onMeasured={handleCanvasMeasured}
          />
        </div>
      </main>
    );
  }

  const showCodeAgain =
    snap.phase === "ready" && codeAgainSessionId !== null && codeAgainSessionId === snap.sessionId;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-neutral-100">{LANDOLT_PAGE_TITLE}</h1>
        <p className="text-base text-neutral-400">{LANDOLT_STAFF_LINE}</p>
      </header>

      {(snap.phase === "idle" || snap.phase === "error") && (
        <section className="flex flex-col gap-6">
          <ChoiceGroup
            id="eye-question"
            question={EYE_QUESTION}
            name="eye"
            choices={LANDOLT_EYES}
            labels={EYE_LABELS}
            value={eye}
            onChoose={(choice) => {
              setEye(choice);
              if (startHint === "eye") {
                setStartHint(null);
              }
            }}
          />
          <ChoiceGroup
            id="wearing-question"
            question={WEARING_QUESTION}
            name="correction"
            choices={CORRECTION_CHOICES}
            labels={CORRECTION_OPTIONS}
            value={correction}
            onChoose={(choice) => {
              setCorrection(choice);
              if (startHint === "wearing") {
                setStartHint(null);
              }
            }}
          />
          <section aria-labelledby="distance-heading" className="flex flex-col gap-3">
            <h2 id="distance-heading" className="text-xl font-semibold text-neutral-100">
              {DISTANCE_HEADING}
            </h2>
            <p aria-live="polite" className="text-base leading-relaxed text-neutral-300">
              {distanceInstruction(distanceMm)}
            </p>
            {distanceMm === SMALL_ROOM_DISTANCE_MM && (
              <p className="text-base leading-relaxed text-neutral-300">{TWO_M_NOTE}</p>
            )}
            <button
              type="button"
              onClick={() => {
                switchDistance(
                  distanceMm === SMALL_ROOM_DISTANCE_MM
                    ? DEFAULT_TEST_DISTANCE_MM
                    : SMALL_ROOM_DISTANCE_MM,
                );
              }}
              className={`${TEXT_ACTION_CLASS} self-start`}
            >
              {distanceMm === SMALL_ROOM_DISTANCE_MM ? USE_3M_LINK : SMALL_ROOM_LINK}
            </button>
            <p className="text-base leading-relaxed text-neutral-300">{DISTANCE_PHONE_NOTE}</p>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-neutral-100">
              <input
                type="checkbox"
                checked={distanceConfirmed}
                onChange={(event) => {
                  setDistanceConfirmed(event.target.checked);
                  if (event.target.checked && startHint === "distance") {
                    setStartHint(null);
                  }
                }}
                className="h-5 w-5 shrink-0 cursor-pointer"
              />
              {distanceConfirmLabel(distanceMm)}
            </label>
          </section>
          <button type="button" onClick={pressStart} className={PRIMARY_ACTION_CLASS}>
            Start
          </button>
          {startMessage !== null && (
            <div
              key={startPressCount}
              ref={startMessageRef}
              role="alert"
              className="scroll-mb-4 rounded border border-amber-300/60 bg-amber-300/10 p-3"
            >
              <p className="text-lg font-medium text-neutral-100">{startMessage}</p>
            </div>
          )}
        </section>
      )}

      {(snap.phase === "creating" ||
        snap.phase === "waiting_for_phone" ||
        snap.phase === "ready") && (
        <section
          className={`flex flex-col items-center text-center ${snap.phase === "waiting_for_phone" ? "gap-4" : "gap-6"}`}
        >
          {snap.phase === "waiting_for_phone" && snap.qrDataUrl !== null && (
            <Image
              src={snap.qrDataUrl}
              alt={QR_ALT}
              width={280}
              height={280}
              unoptimized
              className="rounded bg-white p-2"
            />
          )}
          {snap.phase === "waiting_for_phone" && (
            <p
              ref={pairingInstructionRef}
              tabIndex={-1}
              className="text-center text-base text-neutral-200 outline-none"
            >
              {PAIRING_INSTRUCTION}
            </p>
          )}
          <div role="status" className="flex w-full flex-col gap-6">
            {snap.phase === "creating" && (
              <p className="text-left text-base text-neutral-300">{SETTING_UP}</p>
            )}
            {snap.phase === "waiting_for_phone" && (
              <p className="text-neutral-400">{WAITING_FOR_PHONE}</p>
            )}
            {snap.phase === "ready" && (
              <>
                <p className="text-2xl text-emerald-400">{MAIN_PHONE_CONNECTED}</p>
                <p className="text-2xl leading-relaxed text-neutral-100">
                  {mainGoToMark(snap.distanceMm ?? DEFAULT_TEST_DISTANCE_MM)}
                </p>
                {snap.eye !== null && (
                  <p className="text-4xl font-semibold text-neutral-100">
                    {eyeCoverInstruction(snap.eye)}
                  </p>
                )}
              </>
            )}
          </div>
          {showCodeAgain && snap.qrDataUrl !== null && (
            <>
              <Image
                src={snap.qrDataUrl}
                alt={QR_ALT}
                width={280}
                height={280}
                unoptimized
                className="rounded bg-white p-2"
              />
              <p
                ref={focusOnMount}
                tabIndex={-1}
                className="text-center text-base text-neutral-200 outline-none"
              >
                {PAIRING_INSTRUCTION}
              </p>
            </>
          )}
          {snap.phase !== "creating" && (
            <button type="button" onClick={goBackToStart} className={SECONDARY_ACTION_CLASS}>
              {BACK_TO_START}
            </button>
          )}
          {snap.phase === "ready" && !showCodeAgain && snap.qrDataUrl !== null && (
            <button
              type="button"
              onClick={() => {
                setCodeAgainSessionId(snap.sessionId);
              }}
              className={TEXT_ACTION_CLASS}
            >
              {SHOW_CODE_AGAIN}
            </button>
          )}
        </section>
      )}

      {snap.phase === "complete" && snap.result !== null && (
        <section aria-labelledby="result-heading" className="flex flex-col gap-4">
          <h2 id="result-heading" className="text-xl font-semibold text-neutral-100">
            {RESULT_HEADING}
          </h2>
          <p className="text-2xl leading-relaxed font-semibold text-neutral-100">
            {landoltResultLine(snap.result)}
          </p>
          {snap.eye !== null && snap.correction !== null && snap.distanceMm !== null && (
            <ul className="flex flex-col gap-1 text-base text-neutral-300">
              {landoltDetailLines({
                eye: snap.eye,
                correction: snap.correction,
                distanceMm: snap.distanceMm,
                scoredCount: snap.scoredCount,
                notSureCount: snap.notSureCount,
              }).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {snap.sizeRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-base tabular-nums">
                <thead>
                  <tr className="border-b border-neutral-700 text-neutral-400">
                    {SIZE_TABLE_HEADINGS.map((heading) => (
                      <th key={heading} scope="col" className="py-2 pr-3 font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snap.sizeRows.map((row, index) => (
                    <tr key={`${row.stepIndex}-${index}`} className="border-b border-neutral-800 text-neutral-100">
                      <td className="py-2 pr-3">{row.size}</td>
                      <td className="py-2 pr-3">{row.cs}</td>
                      <td className="py-2 pr-3">{row.correct}</td>
                      <td className="py-2 pr-3">{row.wrong}</td>
                      <td className="py-2">{row.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setStartHint(null);
              startAnotherTest();
            }}
            className={PRIMARY_ACTION_CLASS}
          >
            {START_ANOTHER_TEST}
          </button>
        </section>
      )}
    </main>
  );
}
