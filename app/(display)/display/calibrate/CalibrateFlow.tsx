"use client";

import { useState } from "react";
import { pixelPitchMm, screenPhysicalSizeMm, zoomSignal } from "@/lib/calibration";
import { CardMatcher } from "./CardMatcher";
import { useCalibration } from "./useCalibration";
import { VerifyStep } from "./VerifyStep";

function diagnosticsLine(input: {
  devicePixelRatio: number;
  cssPxPerMm: number;
  cardWidthCssPx: number;
  screenWidthCssPx: number;
  screenHeightCssPx: number;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  includeScreenSize: boolean;
}): string {
  const pitchMm = pixelPitchMm(input.cssPxPerMm, input.devicePixelRatio);
  const parts = [
    `DPR ${input.devicePixelRatio.toFixed(3)}`,
    `${input.cssPxPerMm.toFixed(4)} CSS px/mm`,
    `pitch ${pitchMm.toFixed(4)} mm`,
    `card ${input.cardWidthCssPx.toFixed(1)} CSS px`,
  ];
  if (input.includeScreenSize) {
    const screenSize = screenPhysicalSizeMm(
      input.screenWidthCssPx,
      input.screenHeightCssPx,
      input.cssPxPerMm,
    );
    parts.push(
      `screen ${screenSize.widthMm.toFixed(0)}×${screenSize.heightMm.toFixed(0)} mm (${screenSize.diagonalInches.toFixed(1)} in)`,
    );
  } else {
    parts.push("screen size withheld");
  }
  parts.push(`viewport ${input.viewportWidthCssPx}×${input.viewportHeightCssPx} CSS px`);
  return parts.join(" · ");
}

type CalibrateFlowProps = {
  showDiagnostics: boolean;
};

export function CalibrateFlow({ showDiagnostics }: CalibrateFlowProps) {
  const { ready, calibration, deviceContext, outerWidthCssPx, validity, save, addVerification } =
    useCalibration();
  const [isRecalibrating, setIsRecalibrating] = useState(false);

  if (!ready || deviceContext === null || outerWidthCssPx === null) {
    return <p className="text-neutral-400">Reading this display…</p>;
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
        <CardMatcher
          deviceContext={deviceContext}
          outerWidthCssPx={outerWidthCssPx}
          showDiagnostics={showDiagnostics}
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
        {showDiagnostics ? (
          <p>
            Valid calibration · {calibration.cssPxPerMm.toFixed(2)} CSS px per mm · saved{" "}
            {calibration.createdAtIso}
          </p>
        ) : (
          <p>This screen is calibrated.</p>
        )}
        {showDiagnostics ? (
          <p className="mt-1 font-mono text-xs text-neutral-500">
            {diagnosticsLine({ ...calibration, includeScreenSize })}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setIsRecalibrating(true)}
          className="mt-3 rounded border border-neutral-600 px-4 py-2 text-neutral-200 hover:border-neutral-400"
        >
          Match card again
        </button>
        <p className="mt-2 text-sm text-neutral-500">
          Calibration is saved per browser. Match the card again if you move to a different
          screen.
        </p>
      </div>
      <VerifyStep
        calibration={calibration}
        showDiagnostics={showDiagnostics}
        onVerified={addVerification}
        onRecalibrate={() => setIsRecalibrating(true)}
      />
    </div>
  );
}
