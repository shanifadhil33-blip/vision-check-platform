/**
 * Landolt C geometry. Pure numbers in, numbers out (AGENTS.md rule 1).
 *
 * ISO 8596 Figure 1: outer diameter d, ring width d/5, gap width d/5.
 * In a 0 to 5 unit box: centre (2.5, 2.5), outer radius 2.5, inner radius
 * 1.5, and the gap is a straight slot 1 unit wide with parallel edges, cut
 * from the inner edge to the outer edge and centred on the gap direction.
 * Gap right means slot edges at y = 2.0 and y = 3.0.
 *
 * Rotation is clockwise on screen, because canvas y points down:
 * right 0, down 90, left 180, up 270 degrees.
 *
 * The box height is letterHeightMmForLogMar(stepIndex / 10, distanceMm), so
 * the whole C, its gap and its ring width scale with the letters.
 */

import { letterHeightMmForLogMar, strokeWidthMmForLogMar } from "./logmar";
import type { LandoltDirection } from "./landoltStaircase";

/** Box side in shape units, same grid as the Sloan letters. */
export const LANDOLT_BOX_UNITS = 5;
export const LANDOLT_CENTRE_UNITS = 2.5;
export const LANDOLT_OUTER_RADIUS_UNITS = 2.5;
export const LANDOLT_INNER_RADIUS_UNITS = 1.5;
/** Slot width between its two parallel edges. */
export const LANDOLT_GAP_UNITS = 1;

export const LANDOLT_ROTATION_DEG: Readonly<Record<LandoltDirection, number>> = {
  right: 0,
  down: 90,
  left: 180,
  up: 270,
};

export type PointUnits = { readonly xUnits: number; readonly yUnits: number };

export type LandoltGeometry = {
  readonly direction: LandoltDirection;
  readonly rotationDeg: number;
  readonly centre: PointUnits;
  readonly outerRadiusUnits: number;
  readonly innerRadiusUnits: number;
  /** Angles in radians, clockwise on screen from +x, for the outer arc ends. */
  readonly outerStartRad: number;
  readonly outerEndRad: number;
  /** Inner arc runs back from innerStartRad to innerEndRad, anticlockwise. */
  readonly innerStartRad: number;
  readonly innerEndRad: number;
  /** Each slot edge goes from its inner point to its outer point. */
  readonly slotEdges: readonly [
    { readonly inner: PointUnits; readonly outer: PointUnits },
    { readonly inner: PointUnits; readonly outer: PointUnits },
  ];
};

function rotateAboutCentre(point: PointUnits, rotationRad: number): PointUnits {
  const dx = point.xUnits - LANDOLT_CENTRE_UNITS;
  const dy = point.yUnits - LANDOLT_CENTRE_UNITS;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return {
    xUnits: LANDOLT_CENTRE_UNITS + dx * cos - dy * sin,
    yUnits: LANDOLT_CENTRE_UNITS + dx * sin + dy * cos,
  };
}

/** Pure geometry of one Landolt C in the 0 to 5 unit box. */
export function landoltGeometry(direction: LandoltDirection): LandoltGeometry {
  const rotationDeg = LANDOLT_ROTATION_DEG[direction];
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const halfGapUnits = LANDOLT_GAP_UNITS / 2;
  const outerHalfAngleRad = Math.asin(halfGapUnits / LANDOLT_OUTER_RADIUS_UNITS);
  const innerHalfAngleRad = Math.asin(halfGapUnits / LANDOLT_INNER_RADIUS_UNITS);

  // Gap right, before rotation: edge A at y = centre + half gap, edge B at y = centre - half gap.
  const outerXUnits =
    LANDOLT_CENTRE_UNITS + Math.sqrt(LANDOLT_OUTER_RADIUS_UNITS ** 2 - halfGapUnits ** 2);
  const innerXUnits =
    LANDOLT_CENTRE_UNITS + Math.sqrt(LANDOLT_INNER_RADIUS_UNITS ** 2 - halfGapUnits ** 2);
  const edgeAYUnits = LANDOLT_CENTRE_UNITS + halfGapUnits;
  const edgeBYUnits = LANDOLT_CENTRE_UNITS - halfGapUnits;

  return {
    direction,
    rotationDeg,
    centre: { xUnits: LANDOLT_CENTRE_UNITS, yUnits: LANDOLT_CENTRE_UNITS },
    outerRadiusUnits: LANDOLT_OUTER_RADIUS_UNITS,
    innerRadiusUnits: LANDOLT_INNER_RADIUS_UNITS,
    outerStartRad: rotationRad + outerHalfAngleRad,
    outerEndRad: rotationRad + 2 * Math.PI - outerHalfAngleRad,
    innerStartRad: rotationRad + 2 * Math.PI - innerHalfAngleRad,
    innerEndRad: rotationRad + innerHalfAngleRad,
    slotEdges: [
      {
        inner: rotateAboutCentre({ xUnits: innerXUnits, yUnits: edgeAYUnits }, rotationRad),
        outer: rotateAboutCentre({ xUnits: outerXUnits, yUnits: edgeAYUnits }, rotationRad),
      },
      {
        inner: rotateAboutCentre({ xUnits: innerXUnits, yUnits: edgeBYUnits }, rotationRad),
        outer: rotateAboutCentre({ xUnits: outerXUnits, yUnits: edgeBYUnits }, rotationRad),
      },
    ],
  };
}

/** The subset of CanvasRenderingContext2D the C outline needs. Any recorder works. */
export type LandoltPathSink = {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  closePath(): void;
};

/**
 * Traces the filled C outline in box units: outer arc clockwise the long way
 * round, straight slot edge inwards, inner arc back the long way, and the
 * closing straight slot edge. Fill it with the nonzero rule.
 */
export function traceLandoltPath(sink: LandoltPathSink, direction: LandoltDirection): void {
  const geometry = landoltGeometry(direction);
  const [edgeA, edgeB] = geometry.slotEdges;
  sink.beginPath();
  sink.moveTo(edgeA.outer.xUnits, edgeA.outer.yUnits);
  sink.arc(
    geometry.centre.xUnits,
    geometry.centre.yUnits,
    geometry.outerRadiusUnits,
    geometry.outerStartRad,
    geometry.outerEndRad,
    false,
  );
  sink.lineTo(edgeB.inner.xUnits, edgeB.inner.yUnits);
  sink.arc(
    geometry.centre.xUnits,
    geometry.centre.yUnits,
    geometry.innerRadiusUnits,
    geometry.innerStartRad,
    geometry.innerEndRad,
    true,
  );
  sink.closePath();
}

export type LandoltSizesMm = {
  outerDiameterMm: number;
  ringWidthMm: number;
  gapWidthMm: number;
};

/** Physical sizes at a step and distance: outer = letter height, ring and gap = stroke. */
export function landoltSizesMm(stepIndex: number, distanceMm: number): LandoltSizesMm {
  const logMar = stepIndex / 10;
  const outerDiameterMm = letterHeightMmForLogMar(logMar, distanceMm);
  const strokeWidthMm = strokeWidthMmForLogMar(logMar, distanceMm);
  return {
    outerDiameterMm,
    ringWidthMm: strokeWidthMm,
    gapWidthMm: (outerDiameterMm * LANDOLT_GAP_UNITS) / LANDOLT_BOX_UNITS,
  };
}
