/**
 * Sloan optotype centreline paths in a 0..5 unit grid.
 * Stroke width is exactly 1 unit (applied by the renderer); letter width
 * equals letter height. Centrelines are inset by 0.5 so a stroke of width 1
 * lands on the 0..5 edges.
 * Paths are SVG `d` strings only — no Path2D (AGENTS.md rule 1).
 */

export const SLOAN_LETTERS = ["C", "D", "H", "K", "N", "O", "R", "S", "V", "Z"] as const;

export type SloanLetter = (typeof SLOAN_LETTERS)[number];

export const SLOAN_GRID_UNITS = 5;
export const SLOAN_STROKE_UNITS = 1;

const ARC_RADIUS_EPSILON = 1e-9;

/**
 * Landolt C centreline: circle radius 2 with a 1-unit chord gap on the right.
 * Half-angle asin(0.5/2); arc sweeps the long way (2π − gap).
 */
function landoltCPath(): string {
  const cx = 2.5;
  const cy = 2.5;
  const radius = 2;
  const halfGapAngleRad = Math.asin(0.5 / 2);
  const cosA = Math.cos(halfGapAngleRad);
  const sinA = Math.sin(halfGapAngleRad);

  const gapTopX = cx + radius * cosA;
  const gapTopY = cy - radius * sinA;
  const gapBotX = cx + radius * cosA;
  const gapBotY = cy + radius * sinA;

  // Large arc, SVG sweep 0: from gap-top the long way to gap-bot (gap on the right).
  return `M ${gapTopX} ${gapTopY} A ${radius} ${radius} 0 1 0 ${gapBotX} ${gapBotY}`;
}

export function sloanPath(letter: SloanLetter): string {
  switch (letter) {
    case "H":
      // Two vertical stems and a mid-height crossbar, all centreline.
      return "M 0.5 0 L 0.5 5 M 4.5 0 L 4.5 5 M 0.5 2.5 L 4.5 2.5";

    case "Z":
      // Top bar, diagonal, bottom bar as one continuous centreline.
      return "M 0.5 0.5 L 4.5 0.5 L 0.5 4.5 L 4.5 4.5";

    case "N":
      // Left stem up, diagonal down-right, right stem up — one continuous path.
      return "M 0.5 5 L 0.5 0 L 4.5 5 L 4.5 0";

    case "V":
      // Two legs meeting at bottom centre; renderer uses miter join at the apex.
      return "M 0.5 0 L 2.5 4.5 L 4.5 0";

    case "K":
      // Stem; arms meet the stem at mid-height (0.5, 2.5).
      return "M 0.5 0 L 0.5 5 M 4.5 0 L 0.5 2.5 M 0.5 2.5 L 4.5 5";

    case "O":
      // Circle radius 2; stroked width 1 → outer 2.5, inner 1.5.
      return "M 4.5 2.5 A 2 2 0 1 1 0.5 2.5 A 2 2 0 1 1 4.5 2.5";

    case "C":
      // Landolt C: same circle as O with a one-unit centreline gap on the right.
      return landoltCPath();

    case "D":
      // Stem plus right-hand elliptical bowl from top to bottom of the stem.
      return "M 0.5 0 L 0.5 5 M 0.5 0 A 4 2.5 0 0 1 0.5 5";

    case "R":
      // Stem, upper bowl closing at mid-height, diagonal leg to bottom-right.
      return "M 0.5 0 L 0.5 5 M 0.5 0 A 4 1.25 0 0 1 0.5 2.5 M 0.5 2.5 L 4.5 5";

    case "S":
      // Two touching ellipses (centres 1.5 and 3.5, rx 2 ry 1) meeting at (2.5, 2.5).
      // Upper: ¾ from right over top and left to mid; lower: ¾ out right under bottom to left.
      return "M 4.5 1.5 A 2 1 0 1 0 2.5 2.5 A 2 1 0 1 1 0.5 3.5";

    default: {
      const _exhaustive: never = letter;
      return _exhaustive;
    }
  }
}

export type SloanPathValidation = {
  ok: boolean;
  problems: string[];
};

type ParsedArc = {
  arcIndex: number;
  fromX: number;
  fromY: number;
  rx: number;
  ry: number;
  rotationDeg: number;
  toX: number;
  toY: number;
};

/**
 * SVG elliptical-arc radius check (no-rotation formula when rotation is 0).
 * Returns true when the given rx, ry are large enough (lambda ≤ 1).
 */
function arcRadiiSufficient(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
): { ok: boolean; lambda: number; rx: number; ry: number } {
  const rx = Math.abs(rxIn);
  const ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    return { ok: false, lambda: Number.POSITIVE_INFINITY, rx, ry };
  }

  const phi = (rotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  return { ok: lambda <= 1 + ARC_RADIUS_EPSILON, lambda, rx, ry };
}

function parsePathArcs(d: string): ParsedArc[] {
  const tokens = d.match(/[MLAZmlaz]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
  if (tokens === null) {
    return [];
  }

  const arcs: ParsedArc[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let arcIndex = 0;

  const readNumber = (): number => {
    const raw = tokens[i];
    i += 1;
    if (raw === undefined) {
      return Number.NaN;
    }
    return Number(raw);
  };

  while (i < tokens.length) {
    const command = tokens[i];
    i += 1;
    if (command === undefined) {
      break;
    }

    const upper = command.toUpperCase();
    if (upper === "M" || upper === "L") {
      cx = readNumber();
      cy = readNumber();
      continue;
    }

    if (upper === "A") {
      const rx = readNumber();
      const ry = readNumber();
      const rotationDeg = readNumber();
      const largeArc = readNumber();
      const sweep = readNumber();
      const x = readNumber();
      const y = readNumber();
      void largeArc;
      void sweep;
      arcs.push({
        arcIndex,
        fromX: cx,
        fromY: cy,
        rx,
        ry,
        rotationDeg,
        toX: x,
        toY: y,
      });
      arcIndex += 1;
      cx = x;
      cy = y;
      continue;
    }

    if (upper === "Z") {
      continue;
    }
  }

  return arcs;
}

/**
 * Validates a letter's centreline path: arc radii must not trigger SVG's
 * silent correction. Coordinate-band checks were removed — the 0.5 inset is
 * perpendicular to the stroke only; along-stroke endpoints at 0 and 5 are
 * correct with lineCap "butt". A wrong band check is worse than none.
 */
export function validateSloanPath(letter: SloanLetter): SloanPathValidation {
  const problems: string[] = [];
  const arcs = parsePathArcs(sloanPath(letter));

  for (const arc of arcs) {
    const check = arcRadiiSufficient(
      arc.fromX,
      arc.fromY,
      arc.toX,
      arc.toY,
      arc.rx,
      arc.ry,
      arc.rotationDeg,
    );
    if (!check.ok) {
      problems.push(
        `${letter} arc[${arc.arcIndex}]: radii rx=${arc.rx} ry=${arc.ry} insufficient ` +
          `for endpoints (${arc.fromX},${arc.fromY})→(${arc.toX},${arc.toY}) ` +
          `(lambda=${check.lambda.toFixed(6)}); SVG would scale radii up.`,
      );
    }
  }

  return { ok: problems.length === 0, problems };
}

export function validateAllSloanPaths(): Record<SloanLetter, SloanPathValidation> {
  const results = {} as Record<SloanLetter, SloanPathValidation>;
  for (const letter of SLOAN_LETTERS) {
    results[letter] = validateSloanPath(letter);
  }
  return results;
}
