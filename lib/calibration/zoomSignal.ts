/**
 * Browser zoom / layout signal from outer vs inner viewport widths.
 * Pure numbers in — no DOM (AGENTS.md rule 1).
 */

/** |ratio − 1| at or below this is treated as default zoom / no side panel. */
export const ZOOM_SIGNAL_DEFAULT_TOLERANCE = 0.03;

export type ZoomSignalState = "default" | "not-default" | "unknown";

export type ZoomSignal = {
  state: ZoomSignalState;
  ratio: number;
};

/**
 * Estimate whether the browser chrome layout looks like 100% zoom with no
 * side panel eating horizontal space. Ratio is outerWidth / innerWidth.
 */
export function zoomSignal(
  outerWidthCssPx: number,
  innerWidthCssPx: number,
): ZoomSignal {
  if (
    !Number.isFinite(outerWidthCssPx) ||
    !Number.isFinite(innerWidthCssPx) ||
    outerWidthCssPx <= 0 ||
    innerWidthCssPx <= 0
  ) {
    return { state: "unknown", ratio: Number.NaN };
  }

  const ratio = outerWidthCssPx / innerWidthCssPx;
  if (Math.abs(ratio - 1) <= ZOOM_SIGNAL_DEFAULT_TOLERANCE) {
    return { state: "default", ratio };
  }
  return { state: "not-default", ratio };
}
