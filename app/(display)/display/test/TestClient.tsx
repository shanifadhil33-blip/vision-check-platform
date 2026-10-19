"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { OptotypeCanvas } from "@/app/(display)/display/optotype/OptotypeCanvas";
import { useCalibration } from "@/app/(display)/display/calibrate/useCalibration";
import { zoomSignal, type ZoomSignalState } from "@/lib/calibration";
import {
  CORRECTION_OPTIONS,
  DISTANCE_ONLY_NOTICE,
  SAFETY_NOTICE,
  WEARING_QUESTION,
  resultSentence,
} from "@/lib/acuity";
import { PRIVACY_NOTICE } from "@/lib/acuity/resultWording";
import {
  DEFAULT_TEST_DISTANCE_MM,
  distanceConfirmLabel,
  DISTANCE_HEADING,
  distanceInstruction,
  DISTANCE_PHONE_NOTE,
  msgDistanceNotConfirmed,
  MSG_SETUP_FAILED,
  SMALL_ROOM_LINK,
  TWO_M_NOTE,
  USE_3M_LINK,
} from "@/lib/acuity/distanceSetup";
import {
  BACK_TO_START,
  MSG_CHOOSE_WEARING,
  QR_ALT,
  REFRESH_PAGE,
  RESULT_UNAVAILABLE_HEADING,
  SHOW_CODE_AGAIN,
  START_NEW_TEST,
  STOPPED_HEADING,
  stopReasonText,
} from "@/lib/acuity/flowWording";
import type { RunContext, RunResult } from "@/lib/session/loopState";
import { TripletCanvas } from "./TripletCanvas";
import { mainGoToMark, MAIN_PHONE_CONNECTED } from "@/lib/acuity/autoStart";
import {
  addressPopped,
  backToStart,
  checkSetupNow,
  closeSessionById,
  closeStraySession,
  dismissStartError,
  dispose,
  getServerSnapshot,
  getSnapshot,
  handleCanvasMeasured,
  MSG_CONNECTION,
  MSG_SESSION_CANNOT_CONTINUE,
  prepareTestAgain,
  resume,
  type SessionFormat,
  setSetupProbe,
  start,
  subscribe,
  watchSession,
} from "./testController";

const CORRECTION_CHOICES = ["none", "contacts", "glasses"] as const satisfies readonly RunContext["correction"][];

const PAIRING_INSTRUCTION =
  "Scan this code with your phone’s camera to use it for your answers.";

const SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CHECKING_TEXT_DELAY_MS = 300;

const PRIMARY_LARGE_ACTION_CLASS =
  "inline-flex min-h-14 items-center justify-center rounded bg-sky-600 px-6 text-lg font-medium text-white hover:bg-sky-500";

const SECONDARY_ACTION_CLASS =
  "min-h-11 rounded border border-neutral-600 px-4 py-2 text-base font-medium text-neutral-100 hover:border-neutral-400";

const TEXT_ACTION_CLASS =
  "inline-flex min-h-11 items-center text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-200";

const SMALL_ROOM_DISTANCE_MM = 2000;

function focusOnMount(element: HTMLElement | null): void {
  element?.focus();
}

const diagListeners = new Set<() => void>();
let diagEnabled = false;

function subscribeDiag(listener: () => void): () => void {
  diagListeners.add(listener);
  return () => {
    diagListeners.delete(listener);
  };
}

function diagSnapshot(): boolean {
  return diagEnabled;
}

function diagServerSnapshot(): boolean {
  return false;
}

function resultLogMarLabel(result: RunResult | null): string {
  if (result === null || result.kind === "not-measurable") {
    return "none";
  }
  return String(result.stepIndex / 10);
}

function correctionButtonClass(selected: boolean): string {
  const base = "w-full rounded border px-4 py-3 text-left text-base";
  if (selected) {
    return `${base} border-sky-400 bg-sky-600 font-medium text-white`;
  }
  return `${base} border-neutral-600 bg-neutral-950 text-neutral-100 hover:border-neutral-400`;
}

export default function TestClient() {
  const { ready, calibration, validity } = useCalibration();
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [distanceMm, setDistanceMm] = useState(DEFAULT_TEST_DISTANCE_MM);
  const [distanceConfirmed, setDistanceConfirmed] = useState(false);
  const [format, setFormat] = useState<SessionFormat>("flanked-triplet");
  const [correction, setCorrection] = useState<RunContext["correction"] | null>(null);
  const [startHint, setStartHint] = useState<"wearing" | "distance" | null>(null);
  const [startPressCount, setStartPressCount] = useState(0);
  const [codeAgainSessionId, setCodeAgainSessionId] = useState<string | null>(null);
  const [checkingDelayPassed, setCheckingDelayPassed] = useState(false);
  const showDiag = useSyncExternalStore(subscribeDiag, diagSnapshot, diagServerSnapshot);
  const pairingInstructionRef = useRef<HTMLParagraphElement>(null);
  const startMessageRef = useRef<HTMLDivElement>(null);
  const resumeStarted = useRef(false);
  const invalidCloseStarted = useRef(false);
  const strayCloseStarted = useRef(false);
  const validityOkRef = useRef(false);
  const zoomStateRef = useRef<ZoomSignalState>("unknown");
  const viewportWidthCssPxRef = useRef(0);
  const viewportHeightCssPxRef = useRef(0);

  if (codeAgainSessionId !== null && snap.phase !== "ready") {
    setCodeAgainSessionId(null);
  }

  let startMessage: string | null = null;
  if (snap.sessionId === null && (snap.phase === "idle" || snap.phase === "error")) {
    if (startHint === "wearing") {
      startMessage = MSG_CHOOSE_WEARING;
    } else if (startHint === "distance") {
      startMessage = msgDistanceNotConfirmed(distanceMm);
    } else if (snap.phase === "error" && snap.errorMessage !== null) {
      startMessage = snap.errorMessage;
    }
  }
  // Seeded with the first render's values so mount, and Strict Mode's second mount pass, never scroll.
  const lastStartMessageScrollRef = useRef({ message: startMessage, pressCount: startPressCount });

  const goBackToStart = useCallback((): void => {
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
    if (strayCloseStarted.current) {
      return;
    }
    strayCloseStarted.current = true;
    const raw = new URLSearchParams(window.location.search).get("session");
    if (raw !== null && SESSION_UUID_RE.test(raw)) {
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
    diagEnabled = new URLSearchParams(window.location.search).get("diag") === "1";
    for (const listener of diagListeners) {
      listener();
    }
    return () => {
      diagEnabled = false;
    };
  }, []);

  useEffect(() => {
    if (snap.sessionId !== null) {
      watchSession(snap.sessionId);
    }
  }, [snap.sessionId]);

  useEffect(() => {
    if (resumeStarted.current) {
      return;
    }
    if (!ready || calibration === null || validity === null || !validity.ok) {
      return;
    }
    if (getSnapshot().sessionId !== null) {
      return;
    }
    const raw = new URLSearchParams(window.location.search).get("session");
    if (raw === null || !SESSION_UUID_RE.test(raw)) {
      return;
    }
    resumeStarted.current = true;
    void resume(raw, calibration, window.innerWidth, window.innerHeight);
  }, [ready, calibration, validity]);

  useEffect(() => {
    if (invalidCloseStarted.current || resumeStarted.current) {
      return;
    }
    if (!ready || (calibration !== null && validity !== null && validity.ok)) {
      return;
    }
    const raw = new URLSearchParams(window.location.search).get("session");
    if (raw === null || !SESSION_UUID_RE.test(raw)) {
      return;
    }
    invalidCloseStarted.current = true;
    void closeSessionById(raw);
  }, [ready, calibration, validity]);

  const calibrateHref = showDiag ? "/display/calibrate?diag=1" : "/display/calibrate";

  function switchDistance(nextDistanceMm: number): void {
    setDistanceMm(nextDistanceMm);
    setDistanceConfirmed(false);
    dismissStartError();
  }

  if (!ready) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-neutral-400">
        {checkingDelayPassed ? "Checking calibration…" : null}
      </main>
    );
  }

  if (snap.phase === "stopped" || (snap.phase === "error" && snap.sessionId !== null)) {
    const stopped = snap.phase === "stopped";
    const reasonText = stopped ? stopReasonText(snap.stopReason) : null;
    const setUpScreenAgain =
      stopped && (snap.stopReason === "calibration" || snap.stopReason === null);
    const refreshToCarryOn =
      !stopped &&
      (snap.errorMessage === MSG_CONNECTION || snap.errorMessage === MSG_SETUP_FAILED);
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <p className="text-3xl font-semibold text-neutral-100">
          {stopped ? STOPPED_HEADING : (snap.errorMessage ?? MSG_SESSION_CANNOT_CONTINUE)}
        </p>
        {reasonText !== null && (
          <p className="text-2xl leading-relaxed text-neutral-300">{reasonText}</p>
        )}
        {showDiag && snap.errorDetail !== null && (
          <p className="text-xs text-neutral-500">{snap.errorDetail}</p>
        )}
        {setUpScreenAgain ? (
          <Link href={calibrateHref} className={PRIMARY_LARGE_ACTION_CLASS}>
            Set up your screen
          </Link>
        ) : refreshToCarryOn ? (
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            className={PRIMARY_LARGE_ACTION_CLASS}
          >
            {REFRESH_PAGE}
          </button>
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
        <p className="text-neutral-300">Please set up your screen before the test.</p>
        <Link
          href={calibrateHref}
          className="text-sky-400 underline underline-offset-4 hover:text-sky-300"
        >
          Set up your screen
        </Link>
      </main>
    );
  }

  if (snap.phase === "countdown") {
    return (
      <main className="flex flex-1 items-center justify-center px-6">
        <p aria-live="polite" className="text-center text-9xl font-semibold text-neutral-100">
          {snap.countdownValue === null ? "" : `${snap.countdownValue}…`}
        </p>
      </main>
    );
  }

  if (
    (snap.phase === "presenting" || snap.phase === "awaiting_response") &&
    snap.currentTarget !== null
  ) {
    const logMar =
      snap.currentStepIndex === null ? 0 : snap.currentStepIndex / 10;
    const distance = snap.distanceMm;
    const cssPxPerMm = snap.cssPxPerMm ?? calibration?.cssPxPerMm ?? null;
    const devicePixelRatio = snap.devicePixelRatio ?? calibration?.devicePixelRatio ?? null;
    if (distance === null || cssPxPerMm === null || devicePixelRatio === null) {
      return (
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
          <p className="text-base text-neutral-300">Setting up…</p>
        </main>
      );
    }

    if (
      snap.format === "flanked-triplet" &&
      snap.currentLeftFlanker !== null &&
      snap.currentRightFlanker !== null
    ) {
      return (
        <main className="flex min-h-full flex-1 items-center justify-center bg-white">
          <TripletCanvas
            key={snap.currentTrialIndex ?? 0}
            left={snap.currentLeftFlanker}
            target={snap.currentTarget}
            right={snap.currentRightFlanker}
            logMar={logMar}
            distanceMm={distance}
            cssPxPerMm={cssPxPerMm}
            devicePixelRatio={devicePixelRatio}
            onMeasured={handleCanvasMeasured}
          />
        </main>
      );
    }

    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-white">
        <OptotypeCanvas
          key={snap.currentTrialIndex ?? 0}
          letter={snap.currentTarget}
          logMar={logMar}
          distanceMm={distance}
          cssPxPerMm={cssPxPerMm}
          devicePixelRatio={devicePixelRatio}
          onMeasured={handleCanvasMeasured}
        />
      </main>
    );
  }

  const showFlankersColumn = snap.format === "flanked-triplet";
  const resultAvailable = snap.result !== null && snap.correction !== null;
  const showCodeAgain =
    snap.phase === "ready" && codeAgainSessionId !== null && codeAgainSessionId === snap.sessionId;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
      {snap.phase === "resuming" && (
        <p className="text-base text-neutral-300">Picking up where you left off…</p>
      )}

      {(snap.phase === "idle" || snap.phase === "error") && (
        <section className="flex flex-col gap-4">
          <h1 id="wearing-question" className="text-2xl font-semibold text-neutral-100">
            {WEARING_QUESTION}
          </h1>
          <div
            role="radiogroup"
            aria-labelledby="wearing-question"
            className="flex flex-col gap-3"
          >
            {CORRECTION_CHOICES.map((choice) => {
              const selected = correction === choice;
              return (
                <label
                  key={choice}
                  className={`${correctionButtonClass(selected)} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-400`}
                >
                  <input
                    type="radio"
                    name="correction"
                    value={choice}
                    checked={selected}
                    onChange={() => {
                      setCorrection(choice);
                      if (startHint === "wearing") {
                        setStartHint(null);
                      }
                    }}
                    className="sr-only"
                  />
                  {CORRECTION_OPTIONS[choice]}
                </label>
              );
            })}
          </div>
          <p className="text-base leading-relaxed text-neutral-300">{SAFETY_NOTICE}</p>
          <p className="text-base leading-relaxed text-neutral-300">{PRIVACY_NOTICE}</p>
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
          {showDiag && (
            <label className="flex flex-col gap-1 text-sm text-neutral-300">
              Format
              <select
                value={format}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "single") {
                    setFormat("single");
                    return;
                  }
                  setFormat("flanked-triplet");
                }}
                className="rounded border border-neutral-600 bg-neutral-950 px-3 py-2"
              >
                <option value="flanked-triplet">Flanked triplet</option>
                <option value="single">Single letter</option>
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => {
              setStartPressCount((count) => count + 1);
              if (correction === null) {
                setStartHint("wearing");
                return;
              }
              if (!distanceConfirmed) {
                setStartHint("distance");
                return;
              }
              if (calibration === null) {
                return;
              }
              setStartHint(null);
              void start(
                { distanceMm, confirmed: distanceConfirmed },
                calibration,
                format,
                window.innerWidth,
                window.innerHeight,
                correction,
              );
            }}
            className="rounded bg-sky-600 px-4 py-3 text-base font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
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
          {startHint === null &&
            snap.phase === "error" &&
            snap.errorMessage !== null &&
            showDiag &&
            snap.errorDetail !== null && (
              <p className="text-xs text-neutral-500">{snap.errorDetail}</p>
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
          {snap.phase === "waiting_for_phone" && showDiag && snap.remoteUrl !== null && (
            <p className="w-full select-all break-all rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-sky-300">
              {snap.remoteUrl}
            </p>
          )}
          <div role="status" className="flex w-full flex-col gap-6">
            {snap.phase === "creating" && (
              <p className="text-left text-base text-neutral-300">Setting up…</p>
            )}
            {snap.phase === "waiting_for_phone" && (
              <p className="text-neutral-400">Waiting for the phone to connect…</p>
            )}
            {snap.phase === "ready" && (
              <>
                <p className="text-2xl text-emerald-400">{MAIN_PHONE_CONNECTED}</p>
                <p className="text-2xl leading-relaxed text-neutral-100">
                  {mainGoToMark(snap.distanceMm ?? DEFAULT_TEST_DISTANCE_MM)}
                </p>
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

      {snap.phase === "complete" && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold text-neutral-100">
            {resultAvailable ? "Your result" : RESULT_UNAVAILABLE_HEADING}
          </h1>
          <p className="text-xl leading-relaxed text-neutral-100">
            {snap.result !== null && snap.correction !== null
              ? resultSentence(snap.result, snap.correction)
              : MSG_SESSION_CANNOT_CONTINUE}
          </p>
          <p className="text-base leading-relaxed text-neutral-300">{DISTANCE_ONLY_NOTICE}</p>
          <p className="text-base leading-relaxed text-neutral-300">{SAFETY_NOTICE}</p>
          {resultAvailable ? (
            <button
              type="button"
              onClick={() => {
                setCorrection(null);
                prepareTestAgain();
              }}
              className="rounded bg-sky-600 px-4 py-3 text-base font-medium text-white hover:bg-sky-500"
            >
              Test again with a different option
            </button>
          ) : (
            <button
              type="button"
              onClick={goBackToStart}
              className="rounded bg-sky-600 px-4 py-3 text-base font-medium text-white hover:bg-sky-500"
            >
              {START_NEW_TEST}
            </button>
          )}
          {showDiag && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-neutral-400">
                logMAR: {resultLogMarLabel(snap.result)}
              </p>
              <p className="text-sm text-neutral-400">Not sure: {snap.notSureCount}</p>
              {snap.historyLoadFailed && (
                <p className="text-sm text-neutral-400">
                  Earlier answers could not be loaded here. They are still saved.
                </p>
              )}
              {snap.errorDetail !== null && (
                <p className="text-xs text-neutral-500">{snap.errorDetail}</p>
              )}
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-700 text-neutral-400">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">logMAR</th>
                    <th className="py-2 pr-2">Target</th>
                    {showFlankersColumn && <th className="py-2 pr-2">Flankers</th>}
                    <th className="py-2 pr-2">Response</th>
                    <th className="py-2 pr-2">OK</th>
                    <th className="py-2">Void</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.history.map((row) => (
                    <tr key={row.trialIndex} className="border-b border-neutral-800">
                      <td className="py-2 pr-2">{row.trialIndex}</td>
                      <td className="py-2 pr-2">{(row.stepIndex / 10).toFixed(1)}</td>
                      <td className="py-2 pr-2">{row.target}</td>
                      {showFlankersColumn && (
                        <td className="py-2 pr-2">
                          {row.leftFlanker !== null && row.rightFlanker !== null
                            ? `${row.leftFlanker} · ${row.rightFlanker}`
                            : "—"}
                        </td>
                      )}
                      <td className="py-2 pr-2">
                        {row.responseKind === "not_sure" ? "not sure" : row.responseLetter}
                      </td>
                      <td className="py-2 pr-2">{row.correct ? "yes" : "no"}</td>
                      <td className="py-2">{row.voided ? "yes" : "no"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
