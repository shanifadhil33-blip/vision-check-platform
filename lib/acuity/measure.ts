/**
 * Pure pixel measurements for optotype ink (no browser APIs).
 * Callers pass ImageData buffers from the canvas after drawing.
 */

export type InkBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  widthPx: number;
  heightPx: number;
};

export type InkRun = {
  startPx: number;
  endPx: number;
  widthPx: number;
};

/**
 * Bounding box of pixels with alpha above threshold.
 * Returns null if nothing was drawn.
 */
export function measureInkBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 128,
): InkBounds | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3] ?? 0;
      if (alpha > alphaThreshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right < 0 || bottom < 0) {
    return null;
  }

  return {
    left,
    right,
    top,
    bottom,
    widthPx: right - left + 1,
    heightPx: bottom - top + 1,
  };
}

/**
 * Every continuous ink run on scanRowY, left to right.
 * endPx is inclusive; widthPx = endPx - startPx + 1.
 */
export function measureAllRuns(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  scanRowY: number,
  alphaThreshold = 128,
): InkRun[] {
  if (scanRowY < 0 || scanRowY >= height) {
    return [];
  }

  const rowOffset = scanRowY * width * 4;
  const runs: InkRun[] = [];
  let runStart = -1;

  for (let x = 0; x < width; x += 1) {
    const alpha = pixels[rowOffset + x * 4 + 3] ?? 0;
    const ink = alpha > alphaThreshold;
    if (ink && runStart < 0) {
      runStart = x;
    } else if (!ink && runStart >= 0) {
      const endPx = x - 1;
      runs.push({ startPx: runStart, endPx, widthPx: endPx - runStart + 1 });
      runStart = -1;
    }
  }

  if (runStart >= 0) {
    const endPx = width - 1;
    runs.push({ startPx: runStart, endPx, widthPx: endPx - runStart + 1 });
  }

  return runs;
}

/**
 * Width of the first continuous ink run on scanRowY, scanning from the
 * left edge of the ink bounds (inkLeftPx) rather than from x = 0.
 */
export function measureStrokeWidth(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  scanRowY: number,
  inkLeftPx: number,
  alphaThreshold = 128,
): number | null {
  if (scanRowY < 0 || scanRowY >= height) {
    return null;
  }

  const startX = Math.max(0, inkLeftPx);
  const rowOffset = scanRowY * width * 4;
  let runStart = -1;

  for (let x = startX; x < width; x += 1) {
    const alpha = pixels[rowOffset + x * 4 + 3] ?? 0;
    const ink = alpha > alphaThreshold;
    if (ink && runStart < 0) {
      runStart = x;
    } else if (!ink && runStart >= 0) {
      return x - runStart;
    }
  }

  if (runStart >= 0) {
    return width - runStart;
  }

  return null;
}
