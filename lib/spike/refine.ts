/**
 * Sub-pixel corner refinement for a square marker. Pure numbers in and out.
 *
 * For each side: sample the grey-level profile across the edge at many
 * points along it, take the centroid of the grey-level gradient across the
 * dark-to-light step as the edge position, fit a straight line through those positions by
 * least squares, and intersect neighbouring lines for the corners. Repeated
 * a few times so each pass is centred on the previous pass's lines.
 */

import {
  type CameraLine,
  type CameraPoint,
  distanceCameraPx,
  fitLine,
  intersectLines,
  sideLengthsCameraPx,
} from "./geometry";

/**
 * A greyscale crop of the camera frame. values[row * widthCameraPx + col]
 * is the pixel whose top-left corner is (originX + col, originY + row).
 */
export type GreyImage = {
  values: Float32Array;
  widthCameraPx: number;
  heightCameraPx: number;
  originXCameraPx: number;
  originYCameraPx: number;
};

export type RefineOptions = {
  /** Cells across the whole marker including its black border (8 for ARUCO_MIP_36h12). */
  cellsAcross: number;
  iterations?: number;
};

export type RefinedQuad = {
  corners: CameraPoint[];
  sideLengthsCameraPx: number[];
  edgePointsPerSide: number[];
};

const PROFILE_STEP_CAMERA_PX = 0.25;
const MIN_SEARCH_RADIUS_CAMERA_PX = 2;
const SEARCH_RADIUS_CELL_FRACTION = 0.6;
const SIDE_MARGIN_FRACTION = 0.12;
const MIN_EDGE_POINTS = 5;
const MAX_EDGE_POINTS = 200;
/** Light minus dark across the window, in grey levels, for a sample to count as an edge. */
const MIN_EDGE_CONTRAST_GREY = 20;

/** Bilinear grey value at a point, or NaN outside the crop. Pixel centres at +0.5. */
export function sampleGrey(image: GreyImage, xCameraPx: number, yCameraPx: number): number {
  const fx = xCameraPx - image.originXCameraPx - 0.5;
  const fy = yCameraPx - image.originYCameraPx - 0.5;
  const col = Math.floor(fx);
  const row = Math.floor(fy);
  if (col < 0 || row < 0 || col + 1 >= image.widthCameraPx || row + 1 >= image.heightCameraPx) {
    return Number.NaN;
  }
  const wx = fx - col;
  const wy = fy - row;
  const index = row * image.widthCameraPx + col;
  const v00 = image.values[index] ?? Number.NaN;
  const v10 = image.values[index + 1] ?? Number.NaN;
  const v01 = image.values[index + image.widthCameraPx] ?? Number.NaN;
  const v11 = image.values[index + image.widthCameraPx + 1] ?? Number.NaN;
  return (
    v00 * (1 - wx) * (1 - wy) + v10 * wx * (1 - wy) + v01 * (1 - wx) * wy + v11 * wx * wy
  );
}

/**
 * Edge offset along the outward normal, in camera px, from the centre of one
 * cross-edge profile: the gradient-weighted mean position of the dark-to-light
 * step. Null when no clear step is inside the window.
 */
export function edgeOffsetCameraPx(
  image: GreyImage,
  centre: CameraPoint,
  normalX: number,
  normalY: number,
  searchRadiusCameraPx: number,
): number | null {
  const steps = Math.round(searchRadiusCameraPx / PROFILE_STEP_CAMERA_PX);
  const values: number[] = [];
  for (let i = -steps - 1; i <= steps + 1; i += 1) {
    const offsetCameraPx = i * PROFILE_STEP_CAMERA_PX;
    const value = sampleGrey(
      image,
      centre.xCameraPx + normalX * offsetCameraPx,
      centre.yCameraPx + normalY * offsetCameraPx,
    );
    if (Number.isNaN(value)) {
      return null;
    }
    values.push(value);
  }

  // Signed central-difference gradient. Its centroid is exact for an
  // anti-aliased step whose two plateaus lie inside the window, and it is
  // linear in the grey values, so noise averages out instead of biasing.
  let weightSum = 0;
  let weightedOffsetSum = 0;
  for (let i = 1; i < values.length - 1; i += 1) {
    const gradient =
      ((values[i + 1] ?? 0) - (values[i - 1] ?? 0)) / (2 * PROFILE_STEP_CAMERA_PX);
    const offsetCameraPx = (i - 1 - steps) * PROFILE_STEP_CAMERA_PX;
    weightSum += gradient;
    weightedOffsetSum += gradient * offsetCameraPx;
  }
  const contrastGrey = weightSum * PROFILE_STEP_CAMERA_PX;
  if (contrastGrey < MIN_EDGE_CONTRAST_GREY) {
    return null;
  }
  const offsetCameraPx = weightedOffsetSum / weightSum;
  if (Math.abs(offsetCameraPx) > searchRadiusCameraPx) {
    return null;
  }
  return offsetCameraPx;
}

/**
 * Refine a quad from rough corners. The marker must be dark inside and light
 * outside its outer edge (black border, white quiet zone). Corners can wind
 * either way; side k runs from corner k to corner k + 1.
 */
export function refineQuad(
  image: GreyImage,
  roughCorners: readonly CameraPoint[],
  options: RefineOptions,
): RefinedQuad | null {
  if (roughCorners.length !== 4) {
    return null;
  }
  const iterations = options.iterations ?? 3;
  let corners: CameraPoint[] = roughCorners.map((corner) => ({ ...corner }));
  let edgePointsPerSide: number[] = [0, 0, 0, 0];

  for (let pass = 0; pass < iterations; pass += 1) {
    const centroid = {
      xCameraPx: corners.reduce((sum, c) => sum + c.xCameraPx, 0) / 4,
      yCameraPx: corners.reduce((sum, c) => sum + c.yCameraPx, 0) / 4,
    };
    const meanSideCameraPx =
      sideLengthsCameraPx(corners).reduce((sum, length) => sum + length, 0) / 4;
    const cellCameraPx = meanSideCameraPx / options.cellsAcross;
    const searchRadiusCameraPx = Math.max(
      MIN_SEARCH_RADIUS_CAMERA_PX,
      SEARCH_RADIUS_CELL_FRACTION * cellCameraPx,
    );

    const lines: CameraLine[] = [];
    const counts: number[] = [];
    for (let side = 0; side < 4; side += 1) {
      const start = corners[side];
      const end = corners[(side + 1) % 4];
      if (start === undefined || end === undefined) {
        return null;
      }
      const sideLengthCameraPx = distanceCameraPx(start, end);
      if (sideLengthCameraPx < 4) {
        return null;
      }
      const dirX = (end.xCameraPx - start.xCameraPx) / sideLengthCameraPx;
      const dirY = (end.yCameraPx - start.yCameraPx) / sideLengthCameraPx;
      let normalX = -dirY;
      let normalY = dirX;
      const midX = (start.xCameraPx + end.xCameraPx) / 2;
      const midY = (start.yCameraPx + end.yCameraPx) / 2;
      if (normalX * (midX - centroid.xCameraPx) + normalY * (midY - centroid.yCameraPx) < 0) {
        normalX = -normalX;
        normalY = -normalY;
      }

      const usableFraction = 1 - 2 * SIDE_MARGIN_FRACTION;
      const sampleCount = Math.min(
        MAX_EDGE_POINTS,
        Math.max(MIN_EDGE_POINTS + 1, Math.round(sideLengthCameraPx * usableFraction)),
      );
      const edgePoints: CameraPoint[] = [];
      for (let s = 0; s < sampleCount; s += 1) {
        const t = SIDE_MARGIN_FRACTION + (usableFraction * (s + 0.5)) / sampleCount;
        const centre = {
          xCameraPx: start.xCameraPx + dirX * sideLengthCameraPx * t,
          yCameraPx: start.yCameraPx + dirY * sideLengthCameraPx * t,
        };
        const offsetCameraPx = edgeOffsetCameraPx(
          image,
          centre,
          normalX,
          normalY,
          searchRadiusCameraPx,
        );
        if (offsetCameraPx === null) {
          continue;
        }
        edgePoints.push({
          xCameraPx: centre.xCameraPx + normalX * offsetCameraPx,
          yCameraPx: centre.yCameraPx + normalY * offsetCameraPx,
        });
      }
      if (edgePoints.length < MIN_EDGE_POINTS) {
        return null;
      }
      const line = fitLine(edgePoints);
      if (line === null) {
        return null;
      }
      lines.push(line);
      counts.push(edgePoints.length);
    }

    const nextCorners: CameraPoint[] = [];
    for (let corner = 0; corner < 4; corner += 1) {
      const before = lines[(corner + 3) % 4];
      const after = lines[corner];
      if (before === undefined || after === undefined) {
        return null;
      }
      const point = intersectLines(before, after);
      if (point === null) {
        return null;
      }
      nextCorners.push(point);
    }
    corners = nextCorners;
    edgePointsPerSide = counts;
  }

  return {
    corners,
    sideLengthsCameraPx: sideLengthsCameraPx(corners),
    edgePointsPerSide,
  };
}
