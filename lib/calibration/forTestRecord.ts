import type { Calibration } from "./types";

/**
 * Copy of a saved calibration for one test record.
 * Timestamps on the saved calibration are replaced with the attach time.
 * The input object is not changed.
 */
export function calibrationForTestRecord(
  calibration: Calibration,
  attachedAtIso: string,
): Calibration {
  const record: Calibration = {
    cssPxPerMm: calibration.cssPxPerMm,
    cardWidthCssPx: calibration.cardWidthCssPx,
    devicePixelRatio: calibration.devicePixelRatio,
    viewportWidthCssPx: calibration.viewportWidthCssPx,
    viewportHeightCssPx: calibration.viewportHeightCssPx,
    screenWidthCssPx: calibration.screenWidthCssPx,
    screenHeightCssPx: calibration.screenHeightCssPx,
    userAgent: calibration.userAgent,
    createdAtIso: attachedAtIso,
    method: calibration.method,
    verifications: calibration.verifications.map((verification) => ({
      claimedMm: verification.claimedMm,
      measuredMm: verification.measuredMm,
      createdAtIso: attachedAtIso,
    })),
  };

  if (calibration.cardMatchAgreement !== undefined) {
    const agreement = calibration.cardMatchAgreement;
    record.cardMatchAgreement = {
      usedAttemptIndexes: [
        agreement.usedAttemptIndexes[0],
        agreement.usedAttemptIndexes[1],
      ],
      disagreementPercent: agreement.disagreementPercent,
    };
  }

  return record;
}
