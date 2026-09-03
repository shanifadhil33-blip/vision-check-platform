import type { Calibration, DeviceContext, ValidityResult } from "./types";

/**
 * Calibration is only valid for the conditions it was made under.
 * Browser zoom and OS scaling both move devicePixelRatio. A different
 * monitor changes screen dimensions. A resized window alone does not
 * invalidate (VISION-CHECK-PLATFORM.md section 5.3).
 */
export function isCalibrationStillValid(
  stored: Calibration,
  current: DeviceContext,
): ValidityResult {
  if (stored.devicePixelRatio !== current.devicePixelRatio) {
    return {
      ok: false,
      reason:
        "Display scaling or browser zoom has changed since you calibrated. Recalibrate so sizes stay accurate.",
    };
  }

  if (
    stored.screenWidthCssPx !== current.screenWidthCssPx ||
    stored.screenHeightCssPx !== current.screenHeightCssPx
  ) {
    return {
      ok: false,
      reason:
        "The screen size reported by the system has changed since you calibrated (often a different monitor). Recalibrate on this display.",
    };
  }

  return { ok: true, reason: "Calibration matches the current display scaling and screen." };
}
