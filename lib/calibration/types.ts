export type CalibrationMethod = "card-id1" | "ruler-bar";

export type CalibrationVerification = {
  claimedMm: number;
  measuredMm: number;
  createdAtIso: string;
};

export type CardMatchAttempt = {
  round: number;
  startCardWidthCssPx: number;
  cardWidthCssPx: number;
  devicePixelRatio: number;
  confirmedAtIso: string;
};

export type CardMatchAgreement = {
  usedAttemptIndexes: [number, number];
  disagreementPercent: number;
};

export type RulerBarMeasurement = {
  barCssPx: number;
  measuredMm: number;
  createdAtIso: string;
};

/**
 * Stored calibration. Every length that is a physical quantity states its
 * unit in the name (AGENTS.md rule 3).
 */
export type Calibration = {
  cssPxPerMm: number;
  /**
   * For method "ruler-bar" this holds the equivalent ID-1 card width
   * (CARD_WIDTH_MM * cssPxPerMm), because the database requires the key.
   */
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
  cardMatchAttempts?: CardMatchAttempt[];
  cardMatchAgreement?: CardMatchAgreement;
  rulerBar?: RulerBarMeasurement;
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
