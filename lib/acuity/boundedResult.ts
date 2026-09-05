/**
 * Plain-language descriptions of renderable range and bounded results.
 * Pure strings from numbers — no browser APIs (AGENTS.md rule 1).
 */

import { logMarToSnellenLabel } from "./logmar";
import type { RenderableRange } from "./renderableRange";

/** Do not quote Snellen finer than 6/5 (logMAR −0.1) to a user. */
const FINEST_USER_FACING_LOG_MAR = -0.1;

function metresLabel(distanceMm: number): string {
  if (distanceMm % 1000 === 0) {
    const metres = distanceMm / 1000;
    return metres === 1 ? "1 metre" : `${metres} metres`;
  }
  if (distanceMm === 500) {
    return "0.5 metres";
  }
  return `${distanceMm} millimetres`;
}

function snellenOf(logMar: number): string {
  return logMarToSnellenLabel(logMar);
}

function rangeReachesTarget(range: RenderableRange, clinicalTargetLogMar: number): boolean {
  return (
    Number.isFinite(range.finestLogMar) &&
    Number.isFinite(range.coarsestLogMar) &&
    range.finestLogMar <= clinicalTargetLogMar &&
    range.coarsestLogMar >= clinicalTargetLogMar
  );
}

function rangeHasHeadroom(range: RenderableRange, clinicalTargetLogMar: number): boolean {
  return (
    rangeReachesTarget(range, clinicalTargetLogMar) &&
    range.finestLogMar <= clinicalTargetLogMar - 0.1
  );
}

/**
 * Answers whether this setup can measure normal vision (or another clinical
 * target), not what the ladder's finest rung happens to be.
 * Optional `alternate` is only mentioned when this distance falls short and
 * the alternate reaches the target.
 */
export function describeRenderableRange(
  range: RenderableRange,
  distanceMm: number,
  clinicalTargetLogMar = 0.0,
  alternate?: { range: RenderableRange; distanceMm: number },
): string {
  const atDistance = metresLabel(distanceMm);
  const targetLabel = snellenOf(clinicalTargetLogMar);
  const normalVisionPhrase =
    clinicalTargetLogMar === 0
      ? `normal vision (${targetLabel})`
      : targetLabel;

  if (!Number.isFinite(range.finestLogMar)) {
    return `This screen cannot reliably measure acuity at ${atDistance}.`;
  }

  if (rangeHasHeadroom(range, clinicalTargetLogMar)) {
    return `This screen can measure ${normalVisionPhrase} at ${atDistance}, with headroom.`;
  }

  if (rangeReachesTarget(range, clinicalTargetLogMar)) {
    return `This screen can measure ${normalVisionPhrase} at ${atDistance}.`;
  }

  // Never quote a floor finer than 6/5 to the user.
  const reportedFloorLogMar = Math.max(range.finestLogMar, FINEST_USER_FACING_LOG_MAR);
  const floorLabel = snellenOf(reportedFloorLogMar);
  let message =
    `This screen can only measure to ${floorLabel} at ${atDistance}. ` +
    `Anything finer is a limit of the display, not of your vision.`;

  if (
    alternate !== undefined &&
    rangeReachesTarget(alternate.range, clinicalTargetLogMar)
  ) {
    message += ` At ${metresLabel(alternate.distanceMm)} it would reach ${targetLabel}.`;
  }

  return message;
}

/**
 * When the patient reaches the finest rung this screen can draw.
 * Bounded-result wording from VISION-CHECK-PLATFORM.md section 2.2.
 */
export function describeBoundedResult(
  achievedLogMar: number,
  range: RenderableRange,
): string {
  void range;
  const reported = Math.max(achievedLogMar, FINEST_USER_FACING_LOG_MAR);
  const label = snellenOf(reported);
  return `${label} or better. Finer acuity cannot be reliably measured on this display.`;
}
