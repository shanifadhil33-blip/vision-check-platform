"use client";

import { useState } from "react";
import { CardMatcher } from "./CardMatcher";
import { useCalibration } from "./useCalibration";
import { VerifyStep } from "./VerifyStep";

export function CalibrateFlow() {
  const { ready, calibration, deviceContext, validity, save, addVerification } =
    useCalibration();
  const [isRecalibrating, setIsRecalibrating] = useState(false);

  if (!ready || deviceContext === null) {
    return <p className="text-neutral-400">Reading this display…</p>;
  }

  const isValid = calibration !== null && validity?.ok === true;
  const isInvalid = calibration !== null && validity !== null && !validity.ok;
  const showMatcher = !isValid || isRecalibrating;

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
        <CardMatcher
          deviceContext={deviceContext}
          onConfirm={(next) => {
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
        <p>
          Valid calibration · {calibration.cssPxPerMm.toFixed(2)} CSS px per mm · saved{" "}
          {calibration.createdAtIso}
        </p>
        <button
          type="button"
          onClick={() => setIsRecalibrating(true)}
          className="mt-2 text-sky-400 underline underline-offset-4 hover:text-sky-300"
        >
          Recalibrate
        </button>
      </div>
      <VerifyStep
        calibration={calibration}
        onVerified={addVerification}
        onRecalibrate={() => setIsRecalibrating(true)}
      />
    </div>
  );
}
