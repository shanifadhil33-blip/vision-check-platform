/**
 * The movement marker's cells as plain constants, so the main screen can draw
 * it without loading js-aruco2. markers.test.ts checks these against the
 * js-aruco2 dictionary.
 */

export const MARKER_DICTIONARY_NAME = "ARUCO_MIP_36h12";

/** 6 x 6 data cells plus a one-cell black border on each side. */
export const MARKER_CELLS_ACROSS = 8;

/** The one marker the main screen draws. */
export const MOVEMENT_MARKER_ID = 0;

/** ARUCO_MIP_36h12 marker 0: 36 characters, row by row; "1" is a white data cell, "0" black. */
export const MOVEMENT_MARKER_BITS = "110100101011011000111010000010011101";
