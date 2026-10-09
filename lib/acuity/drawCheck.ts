/**
 * Staff screen-drawing check. Pure numbers and strings in, strings out
 * (AGENTS.md rule 1). Size maths stays in the modules that already own it.
 */

import { pixelPitchMm } from "../calibration/pxPerMm";
import type { ZoomSignal } from "../calibration/zoomSignal";
import { letterHeightMmForLogMar } from "./logmar";
import { customerLabelForStep } from "./resultLabel";
import { computeTestLevels, type LevelLimit } from "./testLevels";

/** 96 CSS px per inch, expressed per millimetre. Used when the screen is not set up. */
export const NOMINAL_CSS_PX_PER_MM = 96 / 25.4;

export const CHECK_PAGE_VERSION = "m5-check-1";

const LIMIT_PHRASE: Readonly<Record<LevelLimit, string>> = {
  "requested-bound": "the test stops here",
  "screen-resolution": "limited by the screen's sharpness",
  "viewport-size": "limited by the window size",
};

export type DrawCheckRow = {
  stepIndex: number;
  askedForDevicePx: number;
  drawnDevicePx: number;
  layoutDevicePx: number;
  canvasHeightDevicePx: number;
};

export type ResultsTextInput = {
  dateIso: string;
  userAgent: string;
  devicePixelRatio: number;
  innerWidthCssPx: number;
  innerHeightCssPx: number;
  screenWidthCssPx: number;
  screenHeightCssPx: number;
  zoom: ZoomSignal;
  screenSetUp: boolean;
  cssPxPerMm: number;
  rows: readonly DrawCheckRow[];
};

/** Unrounded device-pixel letter height the test asks the screen to draw. */
export function requestedDevicePx(
  stepIndex: number,
  distanceMm: number,
  cssPxPerMm: number,
  devicePixelRatio: number,
): number {
  return letterHeightMmForLogMar(stepIndex / 10, distanceMm) * cssPxPerMm * devicePixelRatio;
}

/** True when drawn is within one device pixel of the unrounded request. Exactly 1 passes. */
export function withinOnePixel(askedForDevicePx: number, drawnDevicePx: number): boolean {
  return Math.abs(drawnDevicePx - askedForDevicePx) <= 1 + 1e-9;
}

/**
 * Hundredths, then a sign. A negative value that rounds to zero is "+0.00".
 * r = Math.round(diff * 100) / 100; sign from r >= 0.
 */
export function signedDifference(differenceDevicePx: number): string {
  const rounded = Math.round(differenceDevicePx * 100) / 100;
  const sign = rounded >= 0 ? "+" : "-";
  return sign + Math.abs(rounded).toFixed(2);
}

/**
 * Finest drawable step at one distance, as "6/6 (limited by the screen's sharpness)",
 * or "none" when no level fits.
 */
export function smallestSizeLine(input: {
  distanceMm: number;
  cssPxPerMm: number;
  devicePixelRatio: number;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
}): string {
  const levels = computeTestLevels({
    distanceMm: input.distanceMm,
    pixelPitchMm: pixelPitchMm(input.cssPxPerMm, input.devicePixelRatio),
    cssPxPerMm: input.cssPxPerMm,
    viewportWidthCssPx: input.viewportWidthCssPx,
    viewportHeightCssPx: input.viewportHeightCssPx,
    format: "flanked-triplet",
  });
  if (levels.stepIndices.length === 0) {
    return "none";
  }
  const finestStepIndex = Math.min(...levels.stepIndices);
  const label = customerLabelForStep(finestStepIndex);
  return `${label} (${LIMIT_PHRASE[levels.finestLimitedBy]})`;
}

function zoomText(zoom: ZoomSignal): string {
  if (zoom.state === "unknown") {
    return "could not tell (ratio n/a)";
  }
  const word = zoom.state === "default" ? "normal" : "not 100%";
  return `${word} (ratio ${zoom.ratio.toFixed(3)})`;
}

function smallestCopy(input: ResultsTextInput, distanceMm: number): string {
  if (!input.screenSetUp) {
    return "not available, screen not set up";
  }
  return smallestSizeLine({
    distanceMm,
    cssPxPerMm: input.cssPxPerMm,
    devicePixelRatio: input.devicePixelRatio,
    viewportWidthCssPx: input.innerWidthCssPx,
    viewportHeightCssPx: input.innerHeightCssPx,
  });
}

function letterLine(row: DrawCheckRow): string {
  const label = customerLabelForStep(row.stepIndex);
  const difference = signedDifference(row.drawnDevicePx - row.askedForDevicePx);
  const within = withinOnePixel(row.askedForDevicePx, row.drawnDevicePx) ? "yes" : "no";
  return [
    label,
    row.askedForDevicePx.toFixed(2),
    String(row.drawnDevicePx),
    difference,
    within,
    row.layoutDevicePx.toFixed(2),
    String(row.canvasHeightDevicePx),
  ].join(", ");
}

function resultLine(input: ResultsTextInput, rows: readonly DrawCheckRow[]): string {
  if (input.zoom.state === "not-default") {
    return "Result: not counted, browser zoom isn't at 100%";
  }
  if (rows.length === 0) {
    return "Result: no test sizes fit this window";
  }
  const withinCount = rows.filter((row) =>
    withinOnePixel(row.askedForDevicePx, row.drawnDevicePx),
  ).length;
  return `Result: ${withinCount} of ${rows.length} sizes within one screen pixel`;
}

/** Plain-text block for staff to paste. Lines joined with "\n", no trailing newline. */
export function buildResultsText(input: ResultsTextInput): string {
  const largestFirst = [...input.rows].sort((a, b) => b.stepIndex - a.stepIndex);
  const setupLine = input.screenSetUp
    ? `yes, ${input.cssPxPerMm.toFixed(4)} CSS px per mm`
    : "no, standard size used";

  const lines = [
    `Screen drawing check (${CHECK_PAGE_VERSION})`,
    `Date: ${input.dateIso}`,
    `Browser: ${input.userAgent}`,
    `Screen pixel ratio: ${String(input.devicePixelRatio)}`,
    `Window: ${input.innerWidthCssPx} x ${input.innerHeightCssPx}`,
    `Screen: ${input.screenWidthCssPx} x ${input.screenHeightCssPx}`,
    `Zoom: ${zoomText(input.zoom)}`,
    `Screen set up: ${setupLine}`,
    `Smallest size at 2 m: ${smallestCopy(input, 2000)}`,
    `Smallest size at 3 m: ${smallestCopy(input, 3000)}`,
    "Letters at 2 m (size, asked for, drawn, difference, within one pixel, layout, canvas pixels):",
    ...largestFirst.map(letterLine),
    resultLine(input, largestFirst),
  ];
  return lines.join("\n");
}
