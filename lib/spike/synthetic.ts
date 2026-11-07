/**
 * Synthetic camera frames for the spike's unit tests: exact box-filter
 * anti-aliasing of axis-aligned rectangles on white, plus seeded Gaussian
 * noise. Camera pixel (i, j) covers [i, i + 1] x [j, j + 1].
 */

import type { GreyImage } from "./refine";
import { MARKER_CELLS_ACROSS, markerDataBits } from "./markers";

export type RectCameraPx = {
  leftCameraPx: number;
  topCameraPx: number;
  rightCameraPx: number;
  bottomCameraPx: number;
};

function overlap1d(start: number, end: number, pixel: number): number {
  return Math.max(0, Math.min(end, pixel + 1) - Math.max(start, pixel));
}

function coverage(rect: RectCameraPx, col: number, row: number): number {
  return (
    overlap1d(rect.leftCameraPx, rect.rightCameraPx, col) *
    overlap1d(rect.topCameraPx, rect.bottomCameraPx, row)
  );
}

/** Mulberry32 uniform [0, 1) then Box–Muller. */
export function seededGaussian(seed: number): () => number {
  let state = seed >>> 0;
  const uniform = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    const u1 = Math.max(uniform(), 1e-12);
    const u2 = uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}

/** White (255) background, black rects subtract, white rects add back. */
export function renderGrey(input: {
  widthCameraPx: number;
  heightCameraPx: number;
  blackRects: readonly RectCameraPx[];
  whiteRects?: readonly RectCameraPx[];
  noiseSigmaGrey: number;
  seed: number;
}): GreyImage {
  const values = new Float32Array(input.widthCameraPx * input.heightCameraPx);
  const noise = seededGaussian(input.seed);
  for (let row = 0; row < input.heightCameraPx; row += 1) {
    for (let col = 0; col < input.widthCameraPx; col += 1) {
      let value = 255;
      for (const rect of input.blackRects) {
        value -= 255 * coverage(rect, col, row);
      }
      for (const rect of input.whiteRects ?? []) {
        value += 255 * coverage(rect, col, row);
      }
      values[row * input.widthCameraPx + col] = value + input.noiseSigmaGrey * noise();
    }
  }
  return {
    values,
    widthCameraPx: input.widthCameraPx,
    heightCameraPx: input.heightCameraPx,
    originXCameraPx: 0,
    originYCameraPx: 0,
  };
}

/** An ARUCO_MIP_36h12 marker: black square plus its white data cells. */
export function markerRects(
  markerId: number,
  leftCameraPx: number,
  topCameraPx: number,
  cellCameraPx: number,
): { blackRects: RectCameraPx[]; whiteRects: RectCameraPx[] } {
  const sideCameraPx = cellCameraPx * MARKER_CELLS_ACROSS;
  const bits = markerDataBits(markerId);
  const dataCells = MARKER_CELLS_ACROSS - 2;
  const whiteRects: RectCameraPx[] = [];
  for (let row = 0; row < dataCells; row += 1) {
    for (let col = 0; col < dataCells; col += 1) {
      if (bits[row * dataCells + col] === "1") {
        whiteRects.push({
          leftCameraPx: leftCameraPx + (col + 1) * cellCameraPx,
          topCameraPx: topCameraPx + (row + 1) * cellCameraPx,
          rightCameraPx: leftCameraPx + (col + 2) * cellCameraPx,
          bottomCameraPx: topCameraPx + (row + 2) * cellCameraPx,
        });
      }
    }
  }
  return {
    blackRects: [
      {
        leftCameraPx,
        topCameraPx,
        rightCameraPx: leftCameraPx + sideCameraPx,
        bottomCameraPx: topCameraPx + sideCameraPx,
      },
    ],
    whiteRects,
  };
}

export function greyToRgba(image: GreyImage): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(image.widthCameraPx * image.heightCameraPx * 4);
  for (let i = 0; i < image.values.length; i += 1) {
    const grey = image.values[i] ?? 0;
    rgba[i * 4] = grey;
    rgba[i * 4 + 1] = grey;
    rgba[i * 4 + 2] = grey;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
