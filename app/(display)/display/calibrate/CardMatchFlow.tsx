"use client";

import { useState } from "react";
import {
  cssPxPerMmFromCardWidth,
  evaluateMatches,
  pickStartWidthCssPx,
  type Calibration,
  type CardMatchAttempt,
  type DeviceContext,
} from "@/lib/calibration";
import { CardMatcher } from "./CardMatcher";
import {
  clampCardWidthCssPx,
  DEFAULT_CARD_WIDTH_CSS_PX,
  maxCardWidthCssPx,
  MIN_CARD_WIDTH_CSS_PX,
} from "./cardWidthLimits";
import { RulerCalibrate } from "./RulerCalibrate";

type Phase = "matching" | "next" | "didnt-agree" | "ruler";
type NextKind = "second" | "third";

type RoundDisplay = {
  devicePixelRatio: number;
  screenWidthCssPx: number;
  screenHeightCssPx: number;
};

type CardMatchFlowProps = {
  deviceContext: DeviceContext;
  outerWidthCssPx: number;
  showDiagnostics: boolean;
  onSave: (calibration: Calibration) => void;
  onCancel?: (() => void) | undefined;
};

function clampedDefaultStartCssPx(viewportWidthCssPx: number): number {
  return clampCardWidthCssPx(DEFAULT_CARD_WIDTH_CSS_PX, maxCardWidthCssPx(viewportWidthCssPx));
}

function roundDisplayDiffers(stored: RoundDisplay, current: DeviceContext): boolean {
  return (
    stored.devicePixelRatio !== current.devicePixelRatio ||
    stored.screenWidthCssPx !== current.screenWidthCssPx ||
    stored.screenHeightCssPx !== current.screenHeightCssPx
  );
}

function matchLabelForRound(attemptCount: number): string {
  const matchNumber = attemptCount + 1;
  if (matchNumber <= 1) {
    return "Match 1 of 2";
  }
  if (matchNumber === 2) {
    return "Match 2 of 2";
  }
  return "Extra match";
}

function closestPairMeanCssPx(
  finalsCssPx: readonly number[],
  indexes: readonly [number, number],
): number {
  const leftCssPx = finalsCssPx[indexes[0]];
  const rightCssPx = finalsCssPx[indexes[1]];
  if (leftCssPx === undefined || rightCssPx === undefined) {
    throw new RangeError("Match final is missing.");
  }
  return (leftCssPx + rightCssPx) / 2;
}

function roundWidthsDiagnosticsLine(
  allAttempts: readonly CardMatchAttempt[],
  roundStartIndex: number,
): string | null {
  const finalsCssPx = allAttempts.slice(roundStartIndex).map((attempt) => attempt.cardWidthCssPx);
  if (finalsCssPx.length !== 3) {
    return null;
  }
  const evaluation = evaluateMatches(finalsCssPx);
  if (evaluation.kind !== "failed") {
    return null;
  }
  const widths = finalsCssPx.map((widthCssPx) => widthCssPx.toFixed(1)).join(", ");
  const [leftIndex, rightIndex] = evaluation.closestAttemptIndexes;
  return `${widths} CSS px · closest indexes ${leftIndex} and ${rightIndex} · ${evaluation.disagreementPercent.toFixed(2)}%`;
}

export function CardMatchFlow({
  deviceContext,
  outerWidthCssPx,
  showDiagnostics,
  onSave,
  onCancel,
}: CardMatchFlowProps) {
  const [attempts, setAttempts] = useState<CardMatchAttempt[]>([]);
  const [round, setRound] = useState(1);
  const [roundStartIndex, setRoundStartIndex] = useState(0);
  const [roundDisplay, setRoundDisplay] = useState<RoundDisplay | null>(null);
  const [startCardWidthCssPx, setStartCardWidthCssPx] = useState(() =>
    clampedDefaultStartCssPx(deviceContext.viewportWidthCssPx),
  );
  const [attemptKey, setAttemptKey] = useState(0);
  const [phase, setPhase] = useState<Phase>("matching");
  const [nextKind, setNextKind] = useState<NextKind>("second");
  const [displayChanged, setDisplayChanged] = useState(false);
  const [rulerEstimateCssPxPerMm, setRulerEstimateCssPxPerMm] = useState(() =>
    cssPxPerMmFromCardWidth(DEFAULT_CARD_WIDTH_CSS_PX),
  );

  function startFreshRound(): void {
    setRound(round + 1);
    setRoundStartIndex(attempts.length);
    setRoundDisplay(null);
    setStartCardWidthCssPx(clampedDefaultStartCssPx(deviceContext.viewportWidthCssPx));
    setDisplayChanged(false);
    setAttemptKey(attemptKey + 1);
    setPhase("matching");
  }

  function handleCardConfirm(result: { cardWidthCssPx: number }): void {
    const attempt: CardMatchAttempt = {
      round,
      startCardWidthCssPx,
      cardWidthCssPx: result.cardWidthCssPx,
      devicePixelRatio: deviceContext.devicePixelRatio,
      confirmedAtIso: new Date().toISOString(),
    };
    const nextAttempts = [...attempts, attempt];
    setAttempts(nextAttempts);

    if (roundDisplay !== null && roundDisplayDiffers(roundDisplay, deviceContext)) {
      setRound(round + 1);
      setRoundStartIndex(nextAttempts.length);
      setRoundDisplay(null);
      setStartCardWidthCssPx(clampedDefaultStartCssPx(deviceContext.viewportWidthCssPx));
      setDisplayChanged(true);
      setAttemptKey(attemptKey + 1);
      setPhase("matching");
      return;
    }

    if (roundDisplay === null) {
      setRoundDisplay({
        devicePixelRatio: deviceContext.devicePixelRatio,
        screenWidthCssPx: deviceContext.screenWidthCssPx,
        screenHeightCssPx: deviceContext.screenHeightCssPx,
      });
    }

    const roundFinals = nextAttempts
      .slice(roundStartIndex)
      .map((entry) => entry.cardWidthCssPx);
    const evaluation = evaluateMatches(roundFinals);

    if (evaluation.kind === "need-another") {
      setNextKind(roundFinals.length === 1 ? "second" : "third");
      setPhase("next");
      return;
    }

    if (evaluation.kind === "agreed") {
      const meanCardWidthCssPx = evaluation.meanCardWidthCssPx;
      const calibration: Calibration = {
        cssPxPerMm: cssPxPerMmFromCardWidth(meanCardWidthCssPx),
        cardWidthCssPx: meanCardWidthCssPx,
        devicePixelRatio: deviceContext.devicePixelRatio,
        viewportWidthCssPx: deviceContext.viewportWidthCssPx,
        viewportHeightCssPx: deviceContext.viewportHeightCssPx,
        screenWidthCssPx: deviceContext.screenWidthCssPx,
        screenHeightCssPx: deviceContext.screenHeightCssPx,
        userAgent: deviceContext.userAgent,
        createdAtIso: new Date().toISOString(),
        method: "card-id1",
        verifications: [],
        cardMatchAttempts: nextAttempts,
        cardMatchAgreement: {
          usedAttemptIndexes: [
            roundStartIndex + evaluation.usedAttemptIndexes[0],
            roundStartIndex + evaluation.usedAttemptIndexes[1],
          ],
          disagreementPercent: evaluation.disagreementPercent,
        },
      };
      onSave(calibration);
      return;
    }

    setRulerEstimateCssPxPerMm(
      cssPxPerMmFromCardWidth(
        closestPairMeanCssPx(roundFinals, evaluation.closestAttemptIndexes),
      ),
    );
    setPhase("didnt-agree");
  }

  function handleStartNextMatch(): void {
    const roundFinals = attempts.slice(roundStartIndex).map((entry) => entry.cardWidthCssPx);
    setStartCardWidthCssPx(
      pickStartWidthCssPx({
        previousFinalsCssPx: roundFinals,
        minCssPx: MIN_CARD_WIDTH_CSS_PX,
        maxCssPx: maxCardWidthCssPx(deviceContext.viewportWidthCssPx),
        offsetRandom: Math.random(),
        directionRandom: Math.random(),
      }),
    );
    setDisplayChanged(false);
    setAttemptKey(attemptKey + 1);
    setPhase("matching");
  }

  function handleNoBankCard(): void {
    setRulerEstimateCssPxPerMm(cssPxPerMmFromCardWidth(DEFAULT_CARD_WIDTH_CSS_PX));
    setPhase("ruler");
  }

  if (phase === "next") {
    const heading = nextKind === "second" ? "Now match it once more" : "Please match it one more time";
    const body =
      nextKind === "second"
        ? "Take the card off the screen. The outline will start at a different size, so match it again from scratch."
        : "The two matches were a little different. Take the card off the screen first. The outline will start at a different size.";
    return (
      <section className="flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-3 text-left">
          <h2 className="text-xl font-semibold text-neutral-100">{heading}</h2>
          <p className="text-neutral-300">{body}</p>
        </div>
        <button
          type="button"
          onClick={handleStartNextMatch}
          className="rounded bg-sky-500 px-4 py-2 font-medium text-neutral-950 hover:bg-sky-400"
        >
          Start the next match
        </button>
      </section>
    );
  }

  if (phase === "didnt-agree") {
    const diagnosticsLine = showDiagnostics
      ? roundWidthsDiagnosticsLine(attempts, roundStartIndex)
      : null;
    return (
      <section className="flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-3 text-left">
          <h2 className="text-xl font-semibold text-neutral-100">The matches didn&apos;t agree</h2>
          <p className="text-neutral-300">
            Your three matches were too far apart to use. You can match the card again from the
            start, or measure a line on the screen with a ruler instead.
          </p>
          {diagnosticsLine !== null ? (
            <p className="font-mono text-xs text-neutral-500">{diagnosticsLine}</p>
          ) : null}
        </div>
        <div className="flex w-full flex-col items-stretch gap-3">
          <button
            type="button"
            onClick={startFreshRound}
            className="rounded bg-sky-500 px-4 py-2 font-medium text-neutral-950 hover:bg-sky-400"
          >
            Match the card again
          </button>
          <button
            type="button"
            onClick={() => setPhase("ruler")}
            className="rounded border border-neutral-600 px-4 py-2 text-neutral-200 hover:border-neutral-400"
          >
            Use a ruler instead
          </button>
        </div>
      </section>
    );
  }

  if (phase === "ruler") {
    return (
      <RulerCalibrate
        cssPxPerMmEstimate={rulerEstimateCssPxPerMm}
        deviceContext={deviceContext}
        showDiagnostics={showDiagnostics}
        cardMatchAttempts={attempts}
        onSave={onSave}
        onBack={startFreshRound}
      />
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <button
        type="button"
        onClick={handleNoBankCard}
        className="self-start text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
      >
        No bank card? Use a ruler instead.
      </button>
      {displayChanged ? (
        <div
          className="rounded border border-amber-300/60 bg-amber-300/10 p-3"
          role="status"
        >
          <p className="text-lg font-medium text-neutral-100">
            Your screen or zoom changed during the matches, so they&apos;ve started again.
          </p>
        </div>
      ) : null}
      <CardMatcher
        key={attemptKey}
        deviceContext={deviceContext}
        outerWidthCssPx={outerWidthCssPx}
        showDiagnostics={showDiagnostics}
        startCardWidthCssPx={startCardWidthCssPx}
        matchLabel={matchLabelForRound(attempts.length - roundStartIndex)}
        onConfirm={handleCardConfirm}
        onCancel={onCancel}
      />
    </div>
  );
}
