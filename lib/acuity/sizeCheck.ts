/**
 * Staff letter size check. Pure numbers and strings in, strings out
 * (AGENTS.md rule 1). Letter sizes come only from logmar.ts; the label
 * geometry is text for comparison and never feeds the canvas.
 */

import { pixelPitchMm } from "../calibration/pxPerMm";
import { ARCMIN_TAN, letterHeightMmForLogMar, strokeWidthMmForLogMar } from "./logmar";
import { customerLabelForStep } from "./resultLabel";

export const SIZE_CHECK_VERSION = "size-check-1";

export const SIZE_CHECK_DISTANCES_MM = [2000, 3000] as const;
export type SizeCheckDistanceMm = 2000 | 3000;

/** Step shown first when it is drawable: 6/60. */
export const SIZE_CHECK_DEFAULT_STEP_INDEX = 10;

export type SizeCheckLetter = "H" | "Z";

export type SizeValues = {
  stepIndex: number;
  label: string;
  logMar: number;
  heightMm: number;
  strokeMm: number;
  labelHeightMm: number;
  labelStrokeMm: number;
  otherDistanceMm: SizeCheckDistanceMm;
  otherHeightMm: number;
};

/** The number after "6/" in the customer label, e.g. 7.5 for step 1. */
export function labelDenominator(stepIndex: number): number {
  const label = customerLabelForStep(stepIndex);
  return Number(label.slice(label.indexOf("/") + 1));
}

export function otherSizeCheckDistanceMm(distanceMm: SizeCheckDistanceMm): SizeCheckDistanceMm {
  return distanceMm === 2000 ? 3000 : 2000;
}

export function distanceText(distanceMm: SizeCheckDistanceMm): string {
  return distanceMm === 2000 ? "2 metres" : "3 metres";
}

export function sizeValues(stepIndex: number, distanceMm: SizeCheckDistanceMm): SizeValues {
  const label = customerLabelForStep(stepIndex);
  const logMar = stepIndex / 10;
  const labelHeightMm = (distanceMm * ARCMIN_TAN * 5 * labelDenominator(stepIndex)) / 6;
  const otherDistanceMm = otherSizeCheckDistanceMm(distanceMm);
  return {
    stepIndex,
    label,
    logMar,
    heightMm: letterHeightMmForLogMar(logMar, distanceMm),
    strokeMm: strokeWidthMmForLogMar(logMar, distanceMm),
    labelHeightMm,
    labelStrokeMm: labelHeightMm / 5,
    otherDistanceMm,
    otherHeightMm: letterHeightMmForLogMar(logMar, otherDistanceMm),
  };
}

/**
 * The step to show: the preferred step when the test would draw it, otherwise
 * 6/60 when drawable, otherwise the coarsest drawable step. Null when none fit.
 */
export function sizeCheckStep(
  preferredStepIndex: number | null,
  drawableStepIndices: readonly number[],
): number | null {
  if (preferredStepIndex !== null && drawableStepIndices.includes(preferredStepIndex)) {
    return preferredStepIndex;
  }
  if (drawableStepIndices.includes(SIZE_CHECK_DEFAULT_STEP_INDEX)) {
    return SIZE_CHECK_DEFAULT_STEP_INDEX;
  }
  if (drawableStepIndices.length === 0) {
    return null;
  }
  return Math.max(...drawableStepIndices);
}

/** White space above the arrow and below the letters, so a ruler can find the letter edge. */
export const SIZE_CHECK_AREA_MARGIN_CSS_PX = 32;

/**
 * Height of the white area at this letter height: the letters plus the arrow
 * and the gap above them, each clamp(12, letter, 40) CSS px, plus the margin
 * above and below. The clamp must stay equal to clampArrowCssPx in TripletCanvas.tsx.
 */
export function sizeCheckAreaHeightCssPx(largestLetterCssPx: number): number {
  return (
    largestLetterCssPx +
    2 * Math.min(40, Math.max(12, largestLetterCssPx)) +
    2 * SIZE_CHECK_AREA_MARGIN_CSS_PX
  );
}

export function formatMm(value: number): string {
  return `${value.toFixed(2)} mm`;
}

export function formatLogMar(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) {
    return "0.00";
  }
  return rounded.toFixed(2);
}

export function drawnMm(
  inkHeightDevicePx: number,
  cssPxPerMm: number,
  devicePixelRatio: number,
): number {
  return inkHeightDevicePx / (cssPxPerMm * devicePixelRatio);
}

/** Half a screen pixel for canvas rounding plus one for the anti-aliased top and bottom edges. */
export function roundingAllowanceMm(cssPxPerMm: number, devicePixelRatio: number): number {
  return 1.5 / (cssPxPerMm * devicePixelRatio);
}

/** A click this soon after a touch or pen pointerdown counts as that touch or pen. */
export const IGNORE_CLICK_AFTER_POINTER_DOWN_MS = 1000;

function isTouchOrPen(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

/**
 * Whether to stop a pointer or click event while touches are ignored. An empty
 * or missing pointer type (keyboard, or a browser that gives none) falls back
 * to the last pointerdown, so keyboard activation with no recent touch passes.
 */
export function shouldIgnorePointer(input: {
  ignoring: boolean;
  eventPointerType: string | null;
  lastPointerType: string | null;
  msSinceLastPointerDown: number | null;
}): boolean {
  if (!input.ignoring) {
    return false;
  }
  if (input.eventPointerType !== null && input.eventPointerType !== "") {
    return isTouchOrPen(input.eventPointerType);
  }
  return (
    input.lastPointerType !== null &&
    isTouchOrPen(input.lastPointerType) &&
    input.msSinceLastPointerDown !== null &&
    input.msSinceLastPointerDown < IGNORE_CLICK_AFTER_POINTER_DOWN_MS
  );
}

/** "273 screen pixels, about 43.58 mm". */
export function drawnValueText(
  drawnDevicePx: number,
  cssPxPerMm: number,
  devicePixelRatio: number,
): string {
  return `${drawnDevicePx} screen pixels, about ${formatMm(
    drawnMm(drawnDevicePx, cssPxPerMm, devicePixelRatio),
  )}`;
}

/** "0.160 mm, so the drawn letter can differ by up to 0.08 mm". */
export function screenPixelSizeText(cssPxPerMm: number, devicePixelRatio: number): string {
  const pitchMm = pixelPitchMm(cssPxPerMm, devicePixelRatio);
  return `${pitchMm.toFixed(3)} mm, so the drawn letter can differ by up to ${formatMm(
    roundingAllowanceMm(cssPxPerMm, devicePixelRatio),
  )}`;
}

export function labelGeometryText(values: SizeValues): string {
  return `height ${formatMm(values.labelHeightMm)}, stroke ${formatMm(values.labelStrokeMm)}`;
}

/** Plain-text block for staff to paste. Lines joined with "\n", no trailing newline. */
export function sizeCheckCopyText(input: {
  values: SizeValues;
  distanceMm: SizeCheckDistanceMm;
  letter: SizeCheckLetter;
  drawnDevicePx: number | null;
  cssPxPerMm: number;
  devicePixelRatio: number;
  dateIso: string;
  userAgent: string;
}): string {
  const { values } = input;
  const drawnLine =
    input.drawnDevicePx === null
      ? "Drawn on this screen: not measured"
      : `Drawn on this screen: ${drawnValueText(
          input.drawnDevicePx,
          input.cssPxPerMm,
          input.devicePixelRatio,
        )}`;
  const lines = [
    `Letter size check (${SIZE_CHECK_VERSION})`,
    `Date: ${input.dateIso}`,
    `Browser: ${input.userAgent}`,
    `Distance: ${distanceText(input.distanceMm)}`,
    `Letter: ${input.letter}`,
    `Size: ${values.label}, logMAR ${formatLogMar(values.logMar)}`,
    `Expected letter height: ${formatMm(values.heightMm)}`,
    `Expected stroke width: ${formatMm(values.strokeMm)}`,
    `From the rounded label: ${labelGeometryText(values)}`,
    drawnLine,
    `Screen pixel size: ${screenPixelSizeText(input.cssPxPerMm, input.devicePixelRatio)}`,
    `At ${distanceText(values.otherDistanceMm)} this size is ${formatMm(values.otherHeightMm)}`,
    `Screen set up: ${input.cssPxPerMm.toFixed(4)} CSS px per mm, pixel ratio ${String(
      input.devicePixelRatio,
    )}`,
  ];
  return lines.join("\n");
}
