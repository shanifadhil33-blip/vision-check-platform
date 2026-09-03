import type { PlausibilityResult } from "./types";

/** Rough floor: dense phone displays. */
const MIN_PLAUSIBLE_PIXEL_PITCH_MM = 0.04;

/** Rough ceiling: large low-resolution TVs. */
const MAX_PLAUSIBLE_PIXEL_PITCH_MM = 0.6;

/**
 * Real displays run roughly 0.04 mm (phone) to 0.60 mm (large low-res TV).
 * Outside that band the user has almost certainly mis-set the card match.
 */
export function isPlausiblePixelPitch(pixelPitchMm: number): PlausibilityResult {
  if (!Number.isFinite(pixelPitchMm) || pixelPitchMm <= 0) {
    return {
      ok: false,
      reason: "The calculated pixel size is not a usable number. Check the card match.",
    };
  }

  if (pixelPitchMm < MIN_PLAUSIBLE_PIXEL_PITCH_MM) {
    return {
      ok: false,
      reason: `Pixel pitch ${pixelPitchMm.toFixed(3)} mm is finer than real displays (~${MIN_PLAUSIBLE_PIXEL_PITCH_MM} mm). The outline is probably too large — the card should hide it completely.`,
    };
  }

  if (pixelPitchMm > MAX_PLAUSIBLE_PIXEL_PITCH_MM) {
    return {
      ok: false,
      reason: `Pixel pitch ${pixelPitchMm.toFixed(3)} mm is coarser than typical displays (~${MAX_PLAUSIBLE_PIXEL_PITCH_MM} mm). The outline is probably too small — enlarge it until the card edges line up.`,
    };
  }

  return { ok: true, reason: "Pixel pitch is within the expected range for real displays." };
}
