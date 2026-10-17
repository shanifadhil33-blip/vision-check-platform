"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDiagnosticsLine, zoomSignal, type Calibration } from "@/lib/calibration";
import { CAL_CONTINUE, CAL_DONE } from "@/lib/calibration/calibrateWording";
import { CardMatchFlow } from "./CardMatchFlow";
import { useCalibration } from "./useCalibration";
import { VerifyStep } from "./VerifyStep";

const READING_TEXT_DELAY_MS = 300;

const CAL_DONE_ID = "calibration-done";

function focusOnMount(element: HTMLElement | null): void {
  element?.focus();
}

function savedCalibrationDetailLine(calibration: Calibration): string {
  let line = `method ${calibration.method}`;
  const agreement = calibration.cardMatchAgreement;
  if (agreement !== undefined) {
    const attemptCount = calibration.cardMatchAttempts?.length ?? 0;
    line += ` · matches ${agreement.usedAttemptIndexes[0]} and ${agreement.usedAttemptIndexes[1]} of ${attemptCount} · ${agreement.disagreementPercent.toFixed(2)}%`;
  }
  const rulerBar = calibration.rulerBar;
  if (rulerBar !== undefined) {
    line += ` · bar ${rulerBar.barCssPx} CSS px · measured ${rulerBar.measuredMm.toFixed(1)} mm`;
  }
  return line;
}

type CalibrateFlowProps = {
  showDiagnostics: boolean;
};

export function CalibrateFlow({ showDiagnostics }: CalibrateFlowProps) {
  const { ready, calibration, deviceContext, outerWidthCssPx, validity, save, addVerification } =
    useCalibration();
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const [readingDelayPassed, setReadingDelayPassed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setReadingDelayPassed(true);
    }, READING_TEXT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  if (!ready || deviceContext === null || outerWidthCssPx === null) {
    return (
      <p className="text-neutral-400">{readingDelayPassed ? "Reading this display…" : null}</p>
    );
  }

  const isValid = calibration !== null && validity?.ok === true;
  const isInvalid = calibration !== null && validity !== null && !validity.ok;
  const showMatcher = !isValid || isRecalibrating;
  const zoom = zoomSignal(outerWidthCssPx, deviceContext.viewportWidthCssPx);
  const includeScreenSize = zoom.state === "default" || zoom.state === "unknown";

  if (showMatcher) {
    return (
      <div className="flex w-full flex-col gap-6">
        {calibration === null ? (
          <p className="text-left text-neutral-400">
            No calibration on this browser yet. Match a bank card to this screen to begin.
          </p>
        ) : null}
        {isInvalid && !isRecalibrating ? (
          <div
            className="rounded border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-left text-amber-100"
            role="status"
          >
            <p className="font-medium">Calibration is no longer valid on this display.</p>
            <p className="mt-1 text-sm text-amber-200/90">{validity.reason}</p>
          </div>
        ) : null}
        <CardMatchFlow
          deviceContext={deviceContext}
          outerWidthCssPx={outerWidthCssPx}
          showDiagnostics={showDiagnostics}
          focusHeadingOnMount={isRecalibrating}
          onSave={(next) => {
            save(next);
            setIsRecalibrating(false);
          }}
          onCancel={
            isValid
              ? () => {
                  setIsRecalibrating(false);
                }
              : undefined
          }
        />
      </div>
    );
  }

  if (calibration === null || validity === null) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="rounded border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-left text-sm text-neutral-300">
        {showDiagnostics ? (
          <p>
            Valid calibration · {calibration.cssPxPerMm.toFixed(2)} CSS px per mm · saved{" "}
            {calibration.createdAtIso}
          </p>
        ) : (
          <p id={CAL_DONE_ID}>{CAL_DONE}</p>
        )}
        {showDiagnostics ? (
          <p className="mt-1 font-mono text-xs text-neutral-500">
            {formatDiagnosticsLine({ ...calibration, includeScreenSize })}
          </p>
        ) : null}
        {showDiagnostics ? (
          <p className="mt-1 font-mono text-xs text-neutral-500">
            {savedCalibrationDetailLine(calibration)}
          </p>
        ) : null}
        <div className="mt-3 flex flex-col items-start gap-3">
          <Link
            ref={focusOnMount}
            aria-describedby={showDiagnostics ? undefined : CAL_DONE_ID}
            href="/display/test"
            className="rounded bg-sky-500 px-4 py-2 font-medium text-neutral-950 hover:bg-sky-400"
          >
            {CAL_CONTINUE}
          </Link>
          <button
            type="button"
            onClick={() => setIsRecalibrating(true)}
            className="rounded border border-neutral-600 px-4 py-2 text-neutral-200 hover:border-neutral-400"
          >
            Match the card again
          </button>
        </div>
      </div>
      {showDiagnostics ? (
        <VerifyStep
          calibration={calibration}
          showDiagnostics={showDiagnostics}
          onVerified={addVerification}
          onRecalibrate={() => setIsRecalibrating(true)}
        />
      ) : null}
    </div>
  );
}
