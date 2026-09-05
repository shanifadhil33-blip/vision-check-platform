"use client";

import Link from "next/link";
import { useState } from "react";
import { mmToCssPx } from "@/lib/calibration";
import {
  letterHeightMmForLogMar,
  logMarLadder,
  logMarToSnellenLabel,
  strokeWidthMmForLogMar,
} from "@/lib/acuity/logmar";
import {
  SLOAN_LETTERS,
  type SloanLetter,
  validateAllSloanPaths,
} from "@/lib/acuity/sloan";
import { useCalibration } from "../calibrate/useCalibration";
import {
  H_STROKE_SCAN_EXPECTED_RUNS,
  OptotypeCanvas,
  type OptotypeMeasurement,
} from "./OptotypeCanvas";

const LOGMAR_VALUES = logMarLadder(-0.3, 1.0, 0.1);
const DISTANCES_MM = [2000, 3000] as const;
const PATH_VALIDATION = validateAllSloanPaths();

export default function OptotypePage() {
  const { ready, calibration, validity } = useCalibration();
  const [letter, setLetter] = useState<SloanLetter>("H");
  const [logMar, setLogMar] = useState(0);
  const [distanceMm, setDistanceMm] = useState<(typeof DISTANCES_MM)[number]>(2000);
  const [showAll, setShowAll] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [measurement, setMeasurement] = useState<OptotypeMeasurement | null>(null);

  if (!ready) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12 text-neutral-300">
        <p>Reading calibration…</p>
      </main>
    );
  }

  if (calibration === null || validity === null || !validity.ok) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12 text-left">
        <h1 className="text-2xl font-semibold text-neutral-100">Optotype harness</h1>
        <p className="text-neutral-400">
          {calibration === null
            ? "No valid calibration on this browser yet."
            : `Calibration is not valid on this display: ${validity?.reason ?? ""}`}
        </p>
        <Link
          href="/display/calibrate"
          className="w-fit text-sky-400 underline underline-offset-4 hover:text-sky-300"
        >
          Go to /display/calibrate
        </Link>
      </main>
    );
  }

  const letterHeightMm = letterHeightMmForLogMar(logMar, distanceMm);
  const strokeWidthMm = strokeWidthMmForLogMar(logMar, distanceMm);
  const letterHeightCssPx = mmToCssPx(letterHeightMm, calibration.cssPxPerMm);
  const strokeWidthCssPx = mmToCssPx(strokeWidthMm, calibration.cssPxPerMm);
  const letterHeightDevicePx = letterHeightCssPx * calibration.devicePixelRatio;
  const strokeWidthDevicePx = strokeWidthCssPx * calibration.devicePixelRatio;
  const previewLogMar = 1.0;
  const previewLetterHeightCssPx = mmToCssPx(
    letterHeightMmForLogMar(previewLogMar, distanceMm),
    calibration.cssPxPerMm,
  );

  const actualHeightDevicePx = measurement?.inkBounds?.heightPx ?? null;
  const heightDiffDevicePx =
    actualHeightDevicePx === null ? null : actualHeightDevicePx - letterHeightDevicePx;
  const heightDiffPercent =
    heightDiffDevicePx === null || letterHeightDevicePx === 0
      ? null
      : (heightDiffDevicePx / letterHeightDevicePx) * 100;
  const strokeRuns = measurement?.strokeRuns ?? [];
  const runCountOk = strokeRuns.length === H_STROKE_SCAN_EXPECTED_RUNS;
  const actualStrokeDevicePx = measurement?.strokeWidthDevicePx ?? null;
  const heightPass =
    heightDiffDevicePx !== null && Math.abs(heightDiffDevicePx) <= 1;
  const runsWidthPass =
    runCountOk &&
    strokeRuns.every((run) => Math.abs(run.widthPx - strokeWidthDevicePx) <= 1);
  const measurePass = heightPass && runsWidthPass;
  let measureResultLabel = "measuring…";
  if (measurement !== null) {
    if (!runCountOk) {
      measureResultLabel = "wrong run count, scan row is not measuring what was intended";
    } else if (measurePass) {
      measureResultLabel = "PASS";
    } else {
      measureResultLabel = "FAIL";
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12 text-left">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-neutral-100">Optotype harness</h1>
        <p className="text-sm text-neutral-500">
          Development view. Chart area is black on white. Calibration{" "}
          {calibration.cssPxPerMm.toFixed(4)} CSS px/mm · DPR {calibration.devicePixelRatio}.
        </p>
      </header>

      <div className="flex flex-wrap gap-6 text-sm text-neutral-300">
        <label className="flex flex-col gap-1">
          Letter
          <select
            value={letter}
            onChange={(event) => setLetter(event.target.value as SloanLetter)}
            className="rounded border border-neutral-600 bg-neutral-950 px-2 py-1"
          >
            {SLOAN_LETTERS.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-56 flex-col gap-1">
          logMAR {logMar.toFixed(1)} ({logMarToSnellenLabel(logMar)})
          <input
            type="range"
            min={0}
            max={LOGMAR_VALUES.length - 1}
            step={1}
            value={Math.max(
              0,
              LOGMAR_VALUES.findIndex((value) => Math.abs(value - logMar) < 1e-9),
            )}
            onChange={(event) => {
              const index = Number(event.target.value);
              const next = LOGMAR_VALUES[index];
              if (next !== undefined) {
                setLogMar(next);
              }
            }}
            className="accent-sky-400"
          />
        </label>

        <label className="flex flex-col gap-1">
          Distance
          <select
            value={distanceMm}
            onChange={(event) =>
              setDistanceMm(Number(event.target.value) as (typeof DISTANCES_MM)[number])
            }
            className="rounded border border-neutral-600 bg-neutral-950 px-2 py-1"
          >
            {DISTANCES_MM.map((value) => (
              <option key={value} value={value}>
                {value} mm
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-end gap-2 pb-1">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) => setShowAll(event.target.checked)}
          />
          Show all ten
        </label>

        <label className="flex items-end gap-2 pb-1">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => setShowGrid(event.target.checked)}
          />
          5×5 grid overlay
        </label>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex justify-center rounded-lg bg-white p-8">
          {showAll ? (
            <div
              className="flex flex-wrap items-end justify-center"
              style={{ gap: `${previewLetterHeightCssPx}px` }}
            >
              {SLOAN_LETTERS.map((entry) => (
                <OptotypeCanvas
                  key={entry}
                  letter={entry}
                  logMar={previewLogMar}
                  distanceMm={distanceMm}
                  cssPxPerMm={calibration.cssPxPerMm}
                  devicePixelRatio={calibration.devicePixelRatio}
                  showGrid={showGrid}
                />
              ))}
            </div>
          ) : (
            <OptotypeCanvas
              letter={letter}
              logMar={logMar}
              distanceMm={distanceMm}
              cssPxPerMm={calibration.cssPxPerMm}
              devicePixelRatio={calibration.devicePixelRatio}
              showGrid={showGrid}
              onMeasured={setMeasurement}
            />
          )}
        </div>

        {!showAll ? (
          <section className="rounded-lg border border-neutral-600 bg-neutral-900 p-4 text-sm text-neutral-100">
            <h2 className="mb-3 text-base font-medium text-white">
              Rendered size check · {letter} · logMAR {logMar.toFixed(1)} · {distanceMm} mm
            </h2>
            <table className="w-full max-w-2xl border-collapse text-left">
              <tbody>
                <tr className="border-b border-neutral-700">
                  <th className="py-2 pr-4 font-normal text-neutral-400">Requested letter height</th>
                  <td className="py-2">
                    {letterHeightMm.toFixed(3)} mm · {letterHeightCssPx.toFixed(2)} CSS px ·{" "}
                    {letterHeightDevicePx.toFixed(2)} device px
                  </td>
                </tr>
                <tr className="border-b border-neutral-700">
                  <th className="py-2 pr-4 font-normal text-neutral-400">Measured ink height</th>
                  <td className="py-2">
                    {actualHeightDevicePx === null
                      ? "measuring…"
                      : `${actualHeightDevicePx} device px`}
                  </td>
                </tr>
                <tr className="border-b border-neutral-700">
                  <th className="py-2 pr-4 font-normal text-neutral-400">Height difference</th>
                  <td className="py-2">
                    {heightDiffDevicePx === null || heightDiffPercent === null
                      ? "measuring…"
                      : `${heightDiffDevicePx.toFixed(2)} device px (${heightDiffPercent.toFixed(2)}%)`}
                  </td>
                </tr>
                <tr className="border-b border-neutral-700">
                  <th className="py-2 pr-4 font-normal text-neutral-400">Requested stroke width</th>
                  <td className="py-2">{strokeWidthDevicePx.toFixed(2)} device px</td>
                </tr>
                <tr className="border-b border-neutral-700">
                  <th className="py-2 pr-4 font-normal text-neutral-400">
                    H stroke scan row (¼ ink height)
                  </th>
                  <td className="py-2">
                    {measurement?.strokeScanRowDevicePx == null ||
                    measurement.strokeScanPercentOfInkHeight == null
                      ? "measuring…"
                      : `${measurement.strokeScanRowDevicePx} device px · ${measurement.strokeScanPercentOfInkHeight.toFixed(1)}% of ink height`}
                  </td>
                </tr>
                <tr className="border-b border-neutral-700">
                  <th className="py-2 pr-4 font-normal text-neutral-400">Runs on scan row</th>
                  <td className="py-2">
                    {measurement === null
                      ? "measuring…"
                      : `${strokeRuns.length} (expected ${H_STROKE_SCAN_EXPECTED_RUNS})`}
                  </td>
                </tr>
                <tr className="border-b border-neutral-700">
                  <th className="py-2 pr-4 font-normal text-neutral-400">Run widths</th>
                  <td className="py-2">
                    {measurement === null
                      ? "measuring…"
                      : strokeRuns.length === 0
                        ? "none"
                        : strokeRuns.map((run) => `${run.widthPx} px`).join(", ")}
                  </td>
                </tr>
                <tr className="border-b border-neutral-700">
                  <th className="py-2 pr-4 font-normal text-neutral-400">
                    Measured stroke width (mean of runs)
                  </th>
                  <td className="py-2">
                    {measurement === null
                      ? "measuring…"
                      : !runCountOk
                        ? "n/a (wrong run count)"
                        : actualStrokeDevicePx === null
                          ? "n/a"
                          : `${actualStrokeDevicePx.toFixed(2)} device px`}
                  </td>
                </tr>
                <tr>
                  <th className="py-2 pr-4 font-normal text-neutral-400">Result</th>
                  <td className="py-2 text-lg font-semibold">
                    {measureResultLabel === "PASS" ? (
                      <span className="text-emerald-400">PASS</span>
                    ) : measureResultLabel === "FAIL" ? (
                      <span className="text-red-400">FAIL</span>
                    ) : measureResultLabel.startsWith("wrong") ? (
                      <span className="text-amber-400">{measureResultLabel}</span>
                    ) : (
                      measureResultLabel
                    )}
                    <span className="ml-2 text-sm font-normal text-neutral-500">
                      (height ±1 px · {H_STROKE_SCAN_EXPECTED_RUNS} runs · each run ±1 px)
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        ) : (
          <p className="text-sm text-neutral-500">
            All ten at logMAR {previewLogMar.toFixed(1)} ({logMarToSnellenLabel(previewLogMar)}) for
            geometry inspection. Spacing equals one letter width (ETDRS).
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="text-base font-medium text-neutral-100">Path geometry validation</h2>
        <ul className="flex flex-col gap-1 font-mono text-xs text-neutral-400">
          {SLOAN_LETTERS.map((entry) => {
            const result = PATH_VALIDATION[entry];
            return (
              <li key={entry}>
                <span className={result.ok ? "text-emerald-400" : "text-red-400"}>
                  {entry}: {result.ok ? "ok" : "FAIL"}
                </span>
                {!result.ok
                  ? result.problems.map((problem, problemIndex) => (
                      <div
                        key={`${entry}-${problemIndex}`}
                        className="pl-4 text-red-300/90"
                      >
                        {problem}
                      </div>
                    ))
                  : null}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
