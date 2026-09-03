/**
 * ISO/IEC 7810 ID-1 identification card nominal dimensions.
 * Standard credit and debit cards use this format.
 */

export const CARD_WIDTH_MM = 85.6; // ISO/IEC 7810 ID-1: 85.60 mm
export const CARD_HEIGHT_MM = 53.98;
export const CARD_CORNER_RADIUS_MM = 3.18;

/** Width divided by height. */
export const CARD_ASPECT_RATIO = CARD_WIDTH_MM / CARD_HEIGHT_MM;
