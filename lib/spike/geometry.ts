/**
 * Camera-image geometry for the camera spike. Pure numbers in, numbers out.
 *
 * Coordinate convention: camera pixel (i, j) covers the square
 * [i, i + 1] x [j, j + 1], so its centre is at (i + 0.5, j + 0.5).
 */

export type CameraPoint = { xCameraPx: number; yCameraPx: number };

/** A straight line through a point along a unit direction. */
export type CameraLine = { through: CameraPoint; dirX: number; dirY: number };

export function distanceCameraPx(a: CameraPoint, b: CameraPoint): number {
  return Math.hypot(b.xCameraPx - a.xCameraPx, b.yCameraPx - a.yCameraPx);
}

/** Intersection of two lines, or null when they are (nearly) parallel. */
export function intersectLines(first: CameraLine, second: CameraLine): CameraPoint | null {
  const denominator = first.dirX * second.dirY - first.dirY * second.dirX;
  if (Math.abs(denominator) < 1e-12) {
    return null;
  }
  const offsetX = second.through.xCameraPx - first.through.xCameraPx;
  const offsetY = second.through.yCameraPx - first.through.yCameraPx;
  const along = (offsetX * second.dirY - offsetY * second.dirX) / denominator;
  return {
    xCameraPx: first.through.xCameraPx + along * first.dirX,
    yCameraPx: first.through.yCameraPx + along * first.dirY,
  };
}

export function lineThrough(a: CameraPoint, b: CameraPoint): CameraLine {
  const lengthCameraPx = distanceCameraPx(a, b);
  return {
    through: a,
    dirX: (b.xCameraPx - a.xCameraPx) / lengthCameraPx,
    dirY: (b.yCameraPx - a.yCameraPx) / lengthCameraPx,
  };
}

/**
 * Total least squares line fit (orthogonal regression) with one outlier
 * rejection pass. Null when fewer than two points remain.
 */
export function fitLine(points: readonly CameraPoint[]): CameraLine | null {
  const first = fitLineOnce(points);
  if (first === null) {
    return null;
  }
  const residualsCameraPx = points.map((point) => normalResidualCameraPx(first, point));
  const rmsCameraPx = Math.sqrt(
    residualsCameraPx.reduce((sum, r) => sum + r * r, 0) / residualsCameraPx.length,
  );
  const limitCameraPx = Math.max(0.25, 2.5 * rmsCameraPx);
  const kept = points.filter((_, index) => Math.abs(residualsCameraPx[index] ?? 0) <= limitCameraPx);
  if (kept.length === points.length || kept.length < 5) {
    return first;
  }
  return fitLineOnce(kept) ?? first;
}

function fitLineOnce(points: readonly CameraPoint[]): CameraLine | null {
  if (points.length < 2) {
    return null;
  }
  let meanX = 0;
  let meanY = 0;
  for (const point of points) {
    meanX += point.xCameraPx;
    meanY += point.yCameraPx;
  }
  meanX /= points.length;
  meanY /= points.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const point of points) {
    const dx = point.xCameraPx - meanX;
    const dy = point.yCameraPx - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return {
    through: { xCameraPx: meanX, yCameraPx: meanY },
    dirX: Math.cos(angle),
    dirY: Math.sin(angle),
  };
}

function normalResidualCameraPx(line: CameraLine, point: CameraPoint): number {
  const dx = point.xCameraPx - line.through.xCameraPx;
  const dy = point.yCameraPx - line.through.yCameraPx;
  return -line.dirY * dx + line.dirX * dy;
}

/** The four side lengths of a quad, side k running from corner k to corner k + 1. */
export function sideLengthsCameraPx(corners: readonly CameraPoint[]): number[] {
  const lengths: number[] = [];
  for (let k = 0; k < corners.length; k += 1) {
    const a = corners[k];
    const b = corners[(k + 1) % corners.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    lengths.push(distanceCameraPx(a, b));
  }
  return lengths;
}

/** Marker centre: the intersection of the two diagonals (corner 0 to 2, corner 1 to 3). */
export function quadCentre(corners: readonly CameraPoint[]): CameraPoint | null {
  const [c0, c1, c2, c3] = corners;
  if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) {
    return null;
  }
  return intersectLines(lineThrough(c0, c2), lineThrough(c1, c3));
}
