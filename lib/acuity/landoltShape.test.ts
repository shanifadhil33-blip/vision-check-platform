import { describe, expect, it } from "vitest";
import { LANDOLT_DIRECTIONS, type LandoltDirection } from "./landoltStaircase";
import {
  LANDOLT_BOX_UNITS,
  LANDOLT_ROTATION_DEG,
  landoltGeometry,
  landoltSizesMm,
  traceLandoltPath,
  type LandoltPathSink,
  type PointUnits,
} from "./landoltShape";

function distanceFromCentre(point: PointUnits): number {
  return Math.hypot(point.xUnits - 2.5, point.yUnits - 2.5);
}

function edgeVector(edge: { inner: PointUnits; outer: PointUnits }): { x: number; y: number } {
  return { x: edge.outer.xUnits - edge.inner.xUnits, y: edge.outer.yUnits - edge.inner.yUnits };
}

const UNIT_VECTOR: Readonly<Record<LandoltDirection, { x: number; y: number }>> = {
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
};

describe("landoltGeometry", () => {
  it("has outer radius 2.5 and inner radius 1.5, centred at (2.5, 2.5) in a 5 unit box", () => {
    for (const direction of LANDOLT_DIRECTIONS) {
      const geometry = landoltGeometry(direction);
      expect(LANDOLT_BOX_UNITS).toBe(5);
      expect(geometry.outerRadiusUnits).toBe(2.5);
      expect(geometry.innerRadiusUnits).toBe(1.5);
      expect(geometry.centre).toEqual({ xUnits: 2.5, yUnits: 2.5 });
    }
  });

  it("gap right puts the slot edges at y = 2.0 and y = 3.0 (to 12 decimals)", () => {
    const [edgeA, edgeB] = landoltGeometry("right").slotEdges;
    expect(edgeA.inner.yUnits).toBeCloseTo(3.0, 12);
    expect(edgeA.outer.yUnits).toBeCloseTo(3.0, 12);
    expect(edgeB.inner.yUnits).toBeCloseTo(2.0, 12);
    expect(edgeB.outer.yUnits).toBeCloseTo(2.0, 12);
  });

  it("slot edges are parallel and exactly 1 unit apart in every direction (to 12 decimals)", () => {
    for (const direction of LANDOLT_DIRECTIONS) {
      const [edgeA, edgeB] = landoltGeometry(direction).slotEdges;
      const a = edgeVector(edgeA);
      const b = edgeVector(edgeB);
      expect(a.x * b.y - a.y * b.x).toBeCloseTo(0, 12);
      const lengthA = Math.hypot(a.x, a.y);
      const offsetX = edgeB.inner.xUnits - edgeA.inner.xUnits;
      const offsetY = edgeB.inner.yUnits - edgeA.inner.yUnits;
      const separationUnits = Math.abs(offsetX * a.y - offsetY * a.x) / lengthA;
      expect(separationUnits).toBeCloseTo(1, 12);
    }
  });

  it("each slot edge runs from the inner circle to the outer circle, along the gap direction", () => {
    for (const direction of LANDOLT_DIRECTIONS) {
      const geometry = landoltGeometry(direction);
      for (const edge of geometry.slotEdges) {
        expect(distanceFromCentre(edge.inner)).toBeCloseTo(1.5, 12);
        expect(distanceFromCentre(edge.outer)).toBeCloseTo(2.5, 12);
        const vector = edgeVector(edge);
        const unit = UNIT_VECTOR[direction];
        expect(vector.x * unit.y - vector.y * unit.x).toBeCloseTo(0, 12);
        expect(vector.x * unit.x + vector.y * unit.y).toBeGreaterThan(0);
      }
    }
  });

  it("maps right 0, down 90, left 180, up 270 degrees, clockwise on screen", () => {
    expect(LANDOLT_ROTATION_DEG).toEqual({ right: 0, down: 90, left: 180, up: 270 });
    for (const direction of LANDOLT_DIRECTIONS) {
      const [edgeA, edgeB] = landoltGeometry(direction).slotEdges;
      const midX = (edgeA.outer.xUnits + edgeB.outer.xUnits) / 2 - 2.5;
      const midY = (edgeA.outer.yUnits + edgeB.outer.yUnits) / 2 - 2.5;
      const length = Math.hypot(midX, midY);
      expect(midX / length).toBeCloseTo(UNIT_VECTOR[direction].x, 12);
      expect(midY / length).toBeCloseTo(UNIT_VECTOR[direction].y, 12);
    }
  });

  it("gap down sits at the bottom of the box (larger y), gap up at the top", () => {
    const down = landoltGeometry("down").slotEdges[0].outer;
    const up = landoltGeometry("up").slotEdges[0].outer;
    expect(down.yUnits).toBeGreaterThan(4.9);
    expect(up.yUnits).toBeLessThan(0.1);
  });
});

describe("traceLandoltPath", () => {
  it("traces outer arc clockwise, slot edge, inner arc anticlockwise, then closes", () => {
    const calls: string[] = [];
    const sink: LandoltPathSink = {
      beginPath: () => calls.push("begin"),
      moveTo: (x, y) => calls.push(`move ${x.toFixed(4)} ${y.toFixed(4)}`),
      lineTo: (x, y) => calls.push(`line ${x.toFixed(4)} ${y.toFixed(4)}`),
      arc: (x, y, r, start, end, ccw) =>
        calls.push(`arc ${x} ${y} ${r} ${start.toFixed(4)} ${end.toFixed(4)} ${String(ccw)}`),
      closePath: () => calls.push("close"),
    };
    traceLandoltPath(sink, "right");
    expect(calls).toEqual([
      "begin",
      "move 4.9495 3.0000",
      "arc 2.5 2.5 2.5 0.2014 6.0818 false",
      "line 3.9142 2.0000",
      "arc 2.5 2.5 1.5 5.9433 0.3398 true",
      "close",
    ]);
  });
});

/** Within half a unit of the third decimal, so 43.6335 rounds to 43.634. */
function expectTo3Decimals(valueMm: number, expectedMm: number): void {
  expect(Math.abs(valueMm - expectedMm)).toBeLessThanOrEqual(0.0005 + 1e-9);
}

describe("landoltSizesMm", () => {
  it("6/60 at 3 m: outer 43.634 mm, ring and gap 8.727 mm (to 3 decimals)", () => {
    const sizes = landoltSizesMm(10, 3000);
    // Exact value is 3000 x 0.00029089 x 10 x 5 = 43.6335 mm.
    expect(sizes.outerDiameterMm).toBeCloseTo(43.6335, 9);
    expectTo3Decimals(sizes.outerDiameterMm, 43.634);
    expectTo3Decimals(sizes.gapWidthMm, 8.727);
    expectTo3Decimals(sizes.ringWidthMm, 8.727);
  });

  it("6/6 at 3 m: outer 4.363 mm, ring and gap 0.873 mm (to 3 decimals)", () => {
    const sizes = landoltSizesMm(0, 3000);
    expectTo3Decimals(sizes.outerDiameterMm, 4.363);
    expectTo3Decimals(sizes.gapWidthMm, 0.873);
    expectTo3Decimals(sizes.ringWidthMm, 0.873);
  });

  it("the gap is one fifth of the outer diameter at 2 m too (to 12 decimals)", () => {
    const sizes = landoltSizesMm(3, 2000);
    expect(sizes.gapWidthMm * 5).toBeCloseTo(sizes.outerDiameterMm, 12);
  });
});
