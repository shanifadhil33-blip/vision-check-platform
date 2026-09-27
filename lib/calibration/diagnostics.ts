import { pixelPitchMm, screenPhysicalSizeMm } from "./pxPerMm";

/** One diagnostics line shared by the card matcher and the saved-calibration view. */
export function formatDiagnosticsLine(input: {
  devicePixelRatio: number;
  cssPxPerMm: number;
  cardWidthCssPx: number;
  screenWidthCssPx: number;
  screenHeightCssPx: number;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  includeScreenSize: boolean;
}): string {
  const pitchMm = pixelPitchMm(input.cssPxPerMm, input.devicePixelRatio);
  const parts = [
    `DPR ${input.devicePixelRatio.toFixed(3)}`,
    `${input.cssPxPerMm.toFixed(4)} CSS px/mm`,
    `pitch ${pitchMm.toFixed(4)} mm`,
    `card ${input.cardWidthCssPx.toFixed(1)} CSS px`,
  ];
  if (input.includeScreenSize) {
    const screenSize = screenPhysicalSizeMm(
      input.screenWidthCssPx,
      input.screenHeightCssPx,
      input.cssPxPerMm,
    );
    parts.push(
      `screen ${screenSize.widthMm.toFixed(0)}×${screenSize.heightMm.toFixed(0)} mm (${screenSize.diagonalInches.toFixed(1)} in)`,
    );
  } else {
    parts.push("screen size withheld");
  }
  parts.push(`viewport ${input.viewportWidthCssPx}×${input.viewportHeightCssPx} CSS px`);
  return parts.join(" · ");
}
