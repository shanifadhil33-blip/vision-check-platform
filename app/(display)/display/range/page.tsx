"use client";

import Link from "next/link";
import {
  computeRenderableRange,
  describeRenderableRange,
  logMarToSnellenLabel,
  type RangeLimit,
  type RenderableRange,
} from "@/lib/acuity";
import { useCalibration } from "../calibrate/useCalibration";

const DISTANCES_MM = [500, 1000, 2000, 3000, 4000] as const;

type SyntheticCase = {
  id: string;
  label: string;
  note: string;
  input: {
    cssPxPerMm: number;
    devicePixelRatio: number;
    viewportWidthCssPx: number;
    viewportHeightCssPx: number;
    distanceMm: number;
  };
  /** What we assert for PASS. */
  expect: {
    coarsestLimitedBy?: RangeLimit;
    finestLimitedBy?: RangeLimit;
    emptyRange?: boolean;
    /** Section 2.2: cannot reach 6/6 (logMAR 0) at this distance. */
    cannotReachLogMar0?: boolean;
    /** Section 2.2: can reach 6/6 (logMAR 0) at this distance. */
    canReachLogMar0?: boolean;
  };
};

const SYNTHETIC_CASES: SyntheticCase[] = [
  {
    id: "narrow-viewport",
    label: "1. Narrow viewport ceiling",
    note: "Hand-made inputs — not from stored calibration.",
    input: {
      cssPxPerMm: 4.1589,
      devicePixelRatio: 1.5,
      viewportWidthCssPx: 400,
      viewportHeightCssPx: 300,
      distanceMm: 3000,
    },
    expect: { coarsestLimitedBy: "viewport-size" },
  },
  {
    id: "coarse-screen",
    label: "2. Coarse screen floor",
    note: "0.667 mm pitch — coarser than any real display.",
    input: {
      cssPxPerMm: 1.5,
      devicePixelRatio: 1.0,
      viewportWidthCssPx: 1920,
      viewportHeightCssPx: 1080,
      distanceMm: 2000,
    },
    expect: { finestLimitedBy: "screen-resolution" },
  },
  {
    id: "impossible",
    label: "3. Impossible case",
    note: "Expect NaN bounds at 300 mm (tiny viewport + short distance). Not from calibration.",
    input: {
      cssPxPerMm: 0.5,
      devicePixelRatio: 1.0,
      viewportWidthCssPx: 200,
      viewportHeightCssPx: 150,
      distanceMm: 300,
    },
    expect: { emptyRange: true },
  },
  {
    id: "32in-1080p-2000",
    label: "4a. 32″ 1080p at 2000 mm (doc §2.2)",
    note: "Pitch 0.369 mm · cssPxPerMm 2.71 · DPR 1. Doc: no 6/6 at 2 m.",
    input: {
      cssPxPerMm: 2.71,
      devicePixelRatio: 1.0,
      viewportWidthCssPx: 1920,
      viewportHeightCssPx: 1080,
      distanceMm: 2000,
    },
    expect: {
      finestLimitedBy: "screen-resolution",
      cannotReachLogMar0: true,
    },
  },
  {
    id: "32in-1080p-3000",
    label: "4b. 32″ 1080p at 3000 mm (doc §2.2)",
    note: "Same display. Doc: yes 6/6 at 3 m.",
    input: {
      cssPxPerMm: 2.71,
      devicePixelRatio: 1.0,
      viewportWidthCssPx: 1920,
      viewportHeightCssPx: 1080,
      distanceMm: 3000,
    },
    expect: {
      canReachLogMar0: true,
    },
  },
];

function limitPlainWords(limit: RangeLimit, kind: "finest" | "coarsest"): string {
  if (limit === "requested-bound") {
    return kind === "finest"
      ? "requested finest (screen is fine enough)"
      : "requested coarsest (viewport is large enough)";
  }
  if (limit === "screen-resolution") {
    return "screen resolution (pixels too coarse)";
  }
  return "viewport size (letter plus crowding too large)";
}

function formatLogMar(logMar: number): string {
  if (!Number.isFinite(logMar)) {
    return "NaN";
  }
  return `${logMar.toFixed(1)} (${logMarToSnellenLabel(logMar)})`;
}

function rangeForDistance(
  distanceMm: number,
  cssPxPerMm: number,
  devicePixelRatio: number,
  viewportWidthCssPx: number,
  viewportHeightCssPx: number,
): RenderableRange {
  return computeRenderableRange({
    cssPxPerMm,
    devicePixelRatio,
    viewportWidthCssPx,
    viewportHeightCssPx,
    distanceMm,
  });
}

function canRenderLogMar0(range: RenderableRange): boolean {
  return (
    Number.isFinite(range.finestLogMar) &&
    Number.isFinite(range.coarsestLogMar) &&
    range.finestLogMar <= 0 &&
    range.coarsestLogMar >= 0
  );
}

function evaluateSynthetic(testCase: SyntheticCase): {
  range: RenderableRange;
  threw: boolean;
  expectedSummary: string;
  actualSummary: string;
  pass: boolean;
} {
  let range: RenderableRange;
  let threw = false;
  try {
    range = computeRenderableRange(testCase.input);
  } catch {
    threw = true;
    range = {
      finestLogMar: Number.NaN,
      coarsestLogMar: Number.NaN,
      finestLimitedBy: "screen-resolution",
      coarsestLimitedBy: "viewport-size",
      pixelPitchMm: Number.NaN,
      maxPixelPitchMmAtFinest: Number.NaN,
      strokeWidthDevicePxAtFinest: Number.NaN,
      reachesRequestedFinest: false,
    };
  }

  const checks: boolean[] = [];
  const expectedParts: string[] = [];
  const actualParts: string[] = [];

  if (testCase.expect.emptyRange) {
    expectedParts.push("NaN/NaN, reachesRequestedFinest false, no throw");
    const empty =
      !Number.isFinite(range.finestLogMar) &&
      !Number.isFinite(range.coarsestLogMar) &&
      range.reachesRequestedFinest === false &&
      !threw;
    checks.push(empty);
    actualParts.push(
      `${formatLogMar(range.finestLogMar)} / ${formatLogMar(range.coarsestLogMar)}, ` +
        `reachesRequestedFinest=${String(range.reachesRequestedFinest)}, threw=${String(threw)}`,
    );
  }

  if (testCase.expect.coarsestLimitedBy !== undefined) {
    expectedParts.push(`coarsestLimitedBy=${testCase.expect.coarsestLimitedBy}`);
    actualParts.push(`coarsestLimitedBy=${range.coarsestLimitedBy}`);
    checks.push(range.coarsestLimitedBy === testCase.expect.coarsestLimitedBy);
  }

  if (testCase.expect.finestLimitedBy !== undefined) {
    expectedParts.push(`finestLimitedBy=${testCase.expect.finestLimitedBy}`);
    actualParts.push(`finestLimitedBy=${range.finestLimitedBy}`);
    checks.push(range.finestLimitedBy === testCase.expect.finestLimitedBy);
  }

  if (testCase.expect.cannotReachLogMar0) {
    expectedParts.push("cannot reach 6/6 (logMAR 0)");
    const reaches0 = canRenderLogMar0(range);
    actualParts.push(
      reaches0
        ? `reaches 6/6 (finest ${formatLogMar(range.finestLogMar)})`
        : `cannot reach 6/6 (finest ${formatLogMar(range.finestLogMar)})`,
    );
    checks.push(!reaches0);
  }

  if (testCase.expect.canReachLogMar0) {
    expectedParts.push("can reach 6/6 (logMAR 0)");
    const reaches0 = canRenderLogMar0(range);
    actualParts.push(
      reaches0
        ? `reaches 6/6 (finest ${formatLogMar(range.finestLogMar)})`
        : `cannot reach 6/6 (finest ${formatLogMar(range.finestLogMar)})`,
    );
    checks.push(reaches0);
  }

  if (actualParts.length === 0) {
    actualParts.push(
      `finest ${formatLogMar(range.finestLogMar)} (${range.finestLimitedBy}), ` +
        `coarsest ${formatLogMar(range.coarsestLogMar)} (${range.coarsestLimitedBy})`,
    );
  }

  return {
    range,
    threw,
    expectedSummary: expectedParts.join("; "),
    actualSummary: actualParts.join("; "),
    pass: !threw && checks.every(Boolean),
  };
}

const SYNTHETIC_RESULTS = SYNTHETIC_CASES.map((testCase) => ({
  testCase,
  result: evaluateSynthetic(testCase),
}));

export default function RangePage() {
  const { ready, calibration, validity } = useCalibration();

  if (!ready) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-12 text-neutral-300">
        <p>Reading calibration…</p>
      </main>
    );
  }

  const hasValidCalibration =
    calibration !== null && validity !== null && validity.ok;

  const rows = hasValidCalibration
    ? DISTANCES_MM.map((distanceMm) => {
        const range = rangeForDistance(
          distanceMm,
          calibration.cssPxPerMm,
          calibration.devicePixelRatio,
          calibration.viewportWidthCssPx,
          calibration.viewportHeightCssPx,
        );
        return { distanceMm, range };
      })
    : [];

  const range2000 = rows.find((row) => row.distanceMm === 2000)?.range;
  const range3000 = rows.find((row) => row.distanceMm === 3000)?.range;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12 text-left">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-neutral-100">Renderable range</h1>
        {hasValidCalibration ? (
          <p className="text-sm text-neutral-500">
            Development harness. Pitch{" "}
            {(1 / (calibration.cssPxPerMm * calibration.devicePixelRatio)).toFixed(4)} mm/device
            px · viewport {calibration.viewportWidthCssPx}×{calibration.viewportHeightCssPx} CSS
            px · {calibration.cssPxPerMm.toFixed(4)} CSS px/mm · DPR {calibration.devicePixelRatio}.
          </p>
        ) : (
          <p className="text-sm text-neutral-400">
            {calibration === null
              ? "No valid calibration — live table hidden."
              : `Calibration not valid on this display: ${validity?.reason ?? ""}`}{" "}
            <Link
              href="/display/calibrate"
              className="text-sky-400 underline underline-offset-4 hover:text-sky-300"
            >
              /display/calibrate
            </Link>
          </p>
        )}
      </header>

      {hasValidCalibration ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-neutral-700">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm text-neutral-200">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Distance</th>
                  <th className="px-3 py-2 font-medium">Finest</th>
                  <th className="px-3 py-2 font-medium">Finest limited by</th>
                  <th className="px-3 py-2 font-medium">Coarsest</th>
                  <th className="px-3 py-2 font-medium">Coarsest limited by</th>
                  <th className="px-3 py-2 font-medium">Max pitch at finest / actual</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ distanceMm, range }) => (
                  <tr key={distanceMm} className="border-t border-neutral-800">
                    <td className="px-3 py-2 align-top">
                      {distanceMm} mm
                      {distanceMm === 500 ? (
                        <div className="mt-1 text-xs text-amber-400">
                          Test case only — short distance to force the resolution floor
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs">
                      {formatLogMar(range.finestLogMar)}
                    </td>
                    <td className="px-3 py-2 align-top text-neutral-400">
                      {Number.isFinite(range.finestLogMar)
                        ? limitPlainWords(range.finestLimitedBy, "finest")
                        : "no renderable rung"}
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs">
                      {formatLogMar(range.coarsestLogMar)}
                    </td>
                    <td className="px-3 py-2 align-top text-neutral-400">
                      {Number.isFinite(range.coarsestLogMar)
                        ? limitPlainWords(range.coarsestLimitedBy, "coarsest")
                        : "no renderable rung"}
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs">
                      {Number.isFinite(range.maxPixelPitchMmAtFinest)
                        ? `${range.maxPixelPitchMmAtFinest.toFixed(4)} / ${range.pixelPitchMm.toFixed(4)} mm`
                        : `— / ${range.pixelPitchMm.toFixed(4)} mm`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
              <h2 className="mb-2 text-sm font-medium text-neutral-400">2000 mm</h2>
              <p className="text-neutral-100">
                {range2000 && range3000
                  ? describeRenderableRange(range2000, 2000, 0.0, {
                      range: range3000,
                      distanceMm: 3000,
                    })
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
              <h2 className="mb-2 text-sm font-medium text-neutral-400">3000 mm</h2>
              <p className="text-neutral-100">
                {range3000 ? describeRenderableRange(range3000, 3000, 0.0) : "—"}
              </p>
            </div>
          </section>
        </>
      ) : null}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium text-amber-300">Synthetic test cases</h2>
          <p className="text-sm text-neutral-500">
            Hand-made inputs, not live calibration. Used to exercise viewport-size,
            screen-resolution, empty-range, and the published 32″ 1080p numbers from §2.2.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-amber-700/50">
          <table className="w-full min-w-[56rem] border-collapse text-left text-sm text-neutral-200">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-3 py-2 font-medium">Case</th>
                <th className="px-3 py-2 font-medium">Expected</th>
                <th className="px-3 py-2 font-medium">Actual</th>
                <th className="px-3 py-2 font-medium">Finest / coarsest</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {SYNTHETIC_RESULTS.map(({ testCase, result }) => (
                <tr key={testCase.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 align-top">
                    {testCase.label}
                    <div className="mt-1 text-xs text-neutral-500">{testCase.note}</div>
                  </td>
                  <td className="px-3 py-2 align-top text-neutral-400">
                    {result.expectedSummary}
                  </td>
                  <td className="px-3 py-2 align-top text-neutral-300">
                    {result.actualSummary}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-xs">
                    {formatLogMar(result.range.finestLogMar)}
                    <span className="text-neutral-500"> / </span>
                    {formatLogMar(result.range.coarsestLogMar)}
                    <div className="mt-1 text-neutral-500">
                      {result.range.finestLimitedBy} / {result.range.coarsestLimitedBy}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top font-semibold">
                    {result.pass ? (
                      <span className="text-emerald-400">PASS</span>
                    ) : (
                      <span className="text-red-400">FAIL</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
