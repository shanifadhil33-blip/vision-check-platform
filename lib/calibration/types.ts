export type CalibrationMethod = "card-id1";

export type CalibrationVerification = {
  claimedMm: number;
  measuredMm: number;
  createdAtIso: string;
};

/**
 * Stored calibration. Every length that is a physical quantity states its
 * unit in the name (AGENTS.md rule 3).
 */
export type Calibration = {
  cssPxPerMm: number;
  cardWidthCssPx: number;
  devicePixelRatio: number;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  screenWidthCssPx: number;
  screenHeightCssPx: number;
  userAgent: string;
  createdAtIso: string;
  method: CalibrationMethod;
  verifications: CalibrationVerification[];
};

/**
 * Browser-read values, passed into pure functions as an argument so those
 * modules never touch a global (AGENTS.md rule 1).
 */
export type DeviceContext = {
  devicePixelRatio: number;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  screenWidthCssPx: number;
  screenHeightCssPx: number;
  userAgent: string;
};

export type PlausibilityResult = {
  ok: boolean;
  reason: string;
};

export type ValidityResult = {
  ok: boolean;
  reason: string;
};
