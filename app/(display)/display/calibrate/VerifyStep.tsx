"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  mmToCssPx,
  type Calibration,
  type CalibrationVerification,
} from "@/lib/calibration";
import { useCalibration } from "./useCalibration";

const CLAIMED_BAR_MM = 100;

type VerifyStepProps = {
  calibration: Calibration;
  onVerified: (verification: CalibrationVerification) => void;
  onRecalibrate: () => void;
};

export function VerifyStep({ calibration, onVerified, onRecalibrate }: VerifyStepProps) {
  const { removeVerification } = useCalibration();
  const [measuredText, setMeasuredText] = useState("");
  const [lastResult, setLastResult] = useState<CalibrationVerification | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "fallback">("idle");
  const [fallbackJson, setFallbackJson] = useState<string | null>(null);

  const barWidthCssPx = mmToCssPx(CLAIMED_BAR_MM, calibration.cssPxPerMm);

  const liveDiff = useMemo(() => {
    const measuredMm = Number(measuredText);
    if (!Number.isFinite(measuredMm) || measuredText.trim() === "") {
      return null;
    }
    const differenceMm = measuredMm - CLAIMED_BAR_MM;
    const differencePercent = (differenceMm / CLAIMED_BAR_MM) * 100;
    return { measuredMm, differenceMm, differencePercent };
  }, [measuredText]);

  const verificationSummary = useMemo(() => {
    const count = calibration.verifications.length;
    if (count === 0) {
      return null;
    }
    const measuredValues = calibration.verifications.map((entry) => entry.measuredMm);
    const errorsMm = calibration.verifications.map(
      (entry) => entry.measuredMm - entry.claimedMm,
    );
    const meanMeasuredMm = measuredValues.reduce((sum, value) => sum + value, 0) / count;
    const meanErrorMm = errorsMm.reduce((sum, value) => sum + value, 0) / count;
    const meanErrorPercent = (meanErrorMm / CLAIMED_BAR_MM) * 100;
    const spreadMm = Math.max(...measuredValues) - Math.min(...measuredValues);
    return { count, meanMeasuredMm, meanErrorMm, meanErrorPercent, spreadMm };
  }, [calibration.verifications]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const measuredMm = Number(measuredText);
    if (!Number.isFinite(measuredMm)) {
      return;
    }
    const roundedMm = Math.round(measuredMm * 10) / 10;
    const verification: CalibrationVerification = {
      claimedMm: CLAIMED_BAR_MM,
      measuredMm: roundedMm,
      createdAtIso: new Date().toISOString(),
    };
    onVerified(verification);
    setLastResult(verification);
    setMeasuredText("");
  }

  async function handleCopyResults(): Promise<void> {
    const json = JSON.stringify(calibration, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setFallbackJson(null);
      setCopyStatus("copied");
    } catch {
      setFallbackJson(json);
      setCopyStatus("fallback");
    }
  }

  return (
    <section className="flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3 text-left">
        <h2 className="text-xl font-semibold text-neutral-100">Check with a ruler</h2>
        <p className="text-neutral-300">
          The bar below is drawn as exactly {CLAIMED_BAR_MM.toFixed(1)} mm wide using your
          calibration. Measure it with a ruler and type what you actually get, to one decimal
          place. The gap between claimed and measured is the finding.
        </p>
      </div>

      <div className="flex flex-col items-stretch gap-2">
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            width: `${barWidthCssPx}px`,
            height: "40px",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transform: "translateX(-50%)",
              fontSize: "12px",
              lineHeight: "1",
              color: "#7dd3fc",
            }}
          >
            0
          </span>
          <span
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              transform: "translateX(50%)",
              fontSize: "12px",
              lineHeight: "1",
              color: "#7dd3fc",
              whiteSpace: "nowrap",
            }}
          >
            100 mm
          </span>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "66%",
              right: 0,
              height: "2px",
              marginTop: "-1px",
              backgroundColor: "#7dd3fc",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "12px",
              width: "1px",
              height: "24px",
              backgroundColor: "#7dd3fc",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "12px",
              width: "1px",
              height: "24px",
              backgroundColor: "#7dd3fc",
            }}
          />
        </div>
        <p className="text-sm text-neutral-300">
          Line up the ruler&apos;s zero mark with the left mark, not the end of the ruler. Many
          rulers have a blank margin before zero.
        </p>
        <p className="text-sm text-neutral-500">
          Measure from the outside of the left mark to the outside of the right mark. Claimed
          width: {CLAIMED_BAR_MM.toFixed(1)} mm ({barWidthCssPx.toFixed(1)} CSS px)
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
        <label htmlFor="measured-mm" className="text-sm text-neutral-300">
          Measured length (mm)
        </label>
        <input
          id="measured-mm"
          type="number"
          inputMode="decimal"
          step={0.1}
          min={0}
          value={measuredText}
          onChange={(event) => setMeasuredText(event.target.value)}
          className="w-40 rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-neutral-100"
          required
        />
        {liveDiff ? (
          <p className="text-sm text-neutral-300">
            Difference: {liveDiff.differenceMm >= 0 ? "+" : ""}
            {liveDiff.differenceMm.toFixed(1)} mm (
            {liveDiff.differencePercent >= 0 ? "+" : ""}
            {liveDiff.differencePercent.toFixed(1)}%)
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded bg-sky-500 px-4 py-2 font-medium text-neutral-950 hover:bg-sky-400"
          >
            Save measurement
          </button>
          <button
            type="button"
            onClick={onRecalibrate}
            className="rounded border border-neutral-600 px-4 py-2 text-neutral-200 hover:border-neutral-400"
          >
            Match card again
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyResults();
            }}
            className="rounded border border-neutral-600 px-4 py-2 text-neutral-200 hover:border-neutral-400"
          >
            Copy results
          </button>
        </div>
      </form>

      {copyStatus === "copied" ? (
        <p className="text-sm text-emerald-300" role="status">
          Results copied to the clipboard.
        </p>
      ) : null}
      {copyStatus === "fallback" && fallbackJson !== null ? (
        <div className="flex flex-col gap-2 text-left">
          <p className="text-sm text-amber-300" role="status">
            Clipboard unavailable. Select and copy the JSON below.
          </p>
          <textarea
            readOnly
            value={fallbackJson}
            className="h-40 w-full rounded border border-neutral-600 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200"
          />
        </div>
      ) : null}

      {lastResult ? (
        <p className="text-sm text-emerald-300" role="status">
          Saved: claimed {lastResult.claimedMm.toFixed(1)} mm, measured{" "}
          {lastResult.measuredMm.toFixed(1)} mm.
        </p>
      ) : null}

      {calibration.verifications.length > 0 && verificationSummary !== null ? (
        <div className="text-left">
          <h3 className="mb-2 text-sm font-medium text-neutral-200">Saved measurements</h3>
          <p className="mb-3 text-sm text-neutral-300">
            {verificationSummary.count} measurement
            {verificationSummary.count === 1 ? "" : "s"} · mean{" "}
            {verificationSummary.meanMeasuredMm.toFixed(1)} mm · mean error{" "}
            {verificationSummary.meanErrorMm >= 0 ? "+" : ""}
            {verificationSummary.meanErrorMm.toFixed(1)} mm (
            {verificationSummary.meanErrorPercent >= 0 ? "+" : ""}
            {verificationSummary.meanErrorPercent.toFixed(1)}%) · spread{" "}
            {verificationSummary.spreadMm.toFixed(1)} mm
          </p>
          <ul className="space-y-2 text-sm text-neutral-400">
            {calibration.verifications.map((entry) => {
              const differenceMm = entry.measuredMm - entry.claimedMm;
              const differencePercent = (differenceMm / entry.claimedMm) * 100;
              return (
                <li key={entry.createdAtIso} className="flex flex-wrap items-center gap-3">
                  <span>
                    {entry.measuredMm.toFixed(1)} mm measured vs {entry.claimedMm.toFixed(1)} mm
                    claimed · {differenceMm >= 0 ? "+" : ""}
                    {differenceMm.toFixed(1)} mm ({differencePercent >= 0 ? "+" : ""}
                    {differencePercent.toFixed(1)}%) · {entry.createdAtIso}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeVerification(entry.createdAtIso)}
                    className="text-xs text-amber-300 underline underline-offset-2 hover:text-amber-200"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
