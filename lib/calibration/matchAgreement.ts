/** Two card-match widths agree when their disagreement is at or under this percent. */
export const MATCH_AGREEMENT_LIMIT_PERCENT = 2;

/**
 * Percent disagreement between two positive widths:
 * |a − b| / ((a + b) / 2) * 100.
 */
export function disagreementPercent(aCssPx: number, bCssPx: number): number {
  if (!Number.isFinite(aCssPx) || aCssPx <= 0 || !Number.isFinite(bCssPx) || bCssPx <= 0) {
    throw new RangeError("Card widths must be finite and greater than 0.");
  }
  return (Math.abs(aCssPx - bCssPx) / ((aCssPx + bCssPx) / 2)) * 100;
}

export type MatchEvaluation =
  | { kind: "need-another" }
  | {
      kind: "agreed";
      usedAttemptIndexes: [number, number];
      meanCardWidthCssPx: number;
      disagreementPercent: number;
    }
  | {
      kind: "failed";
      closestAttemptIndexes: [number, number];
      disagreementPercent: number;
    };

function finalAt(finalsCssPx: readonly number[], index: number): number {
  const widthCssPx = finalsCssPx[index];
  if (widthCssPx === undefined) {
    throw new RangeError("Match final is missing.");
  }
  return widthCssPx;
}

/**
 * Zero or one final needs another match. Two finals agree or need another.
 * Three finals take the closest pair: agree, or fail. More than three throws.
 * Equal disagreement keeps the pair with the lower indexes.
 */
export function evaluateMatches(finalsCssPx: readonly number[]): MatchEvaluation {
  if (finalsCssPx.length > 3) {
    throw new RangeError("evaluateMatches accepts at most three finals.");
  }

  if (finalsCssPx.length < 2) {
    return { kind: "need-another" };
  }

  const pairIndexes: ReadonlyArray<[number, number]> =
    finalsCssPx.length === 2
      ? [[0, 1]]
      : [
          [0, 1],
          [0, 2],
          [1, 2],
        ];

  let closestIndexes: [number, number] | null = null;
  let closestDisagreement = Number.POSITIVE_INFINITY;

  for (const indexes of pairIndexes) {
    const disagreement = disagreementPercent(
      finalAt(finalsCssPx, indexes[0]),
      finalAt(finalsCssPx, indexes[1]),
    );
    if (closestIndexes === null || disagreement < closestDisagreement) {
      closestIndexes = indexes;
      closestDisagreement = disagreement;
    }
  }

  if (closestIndexes === null) {
    throw new RangeError("Match final is missing.");
  }

  if (closestDisagreement <= MATCH_AGREEMENT_LIMIT_PERCENT) {
    const leftCssPx = finalAt(finalsCssPx, closestIndexes[0]);
    const rightCssPx = finalAt(finalsCssPx, closestIndexes[1]);
    return {
      kind: "agreed",
      usedAttemptIndexes: closestIndexes,
      meanCardWidthCssPx: (leftCssPx + rightCssPx) / 2,
      disagreementPercent: closestDisagreement,
    };
  }

  if (finalsCssPx.length === 2) {
    return { kind: "need-another" };
  }

  return {
    kind: "failed",
    closestAttemptIndexes: closestIndexes,
    disagreementPercent: closestDisagreement,
  };
}
