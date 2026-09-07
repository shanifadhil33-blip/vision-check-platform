"use client";

import { useState, type KeyboardEvent } from "react";
import {
  CARD_CORNER_RADIUS_MM,
  CARD_WIDTH_MM,
  cardHeightCssPxFromWidth,
  cssPxPerMmFromCardWidth,
  isPlausiblePixelPitch,
  mmToCssPx,
  pixelPitchMm,
  screenPhysicalSizeMm,
  type Calibration,
  type DeviceContext,
} from "@/lib/calibration";

const MIN_CARD_WIDTH_CSS_PX = 120;
const ABSOLUTE_MAX_CARD_WIDTH_CSS_PX = 900;
/** Starting guess: 4.0 CSS px per mm. */
const DEFAULT_CARD_WIDTH_CSS_PX = Math.round(4 * CARD_WIDTH_MM);

type CardMatcherProps = {
  deviceContext: DeviceContext;
  onConfirm: (calibration: Calibration) => void;
  onCancel?: (() => void) | undefined;
};

export function CardMatcher({ deviceContext, onConfirm, onCancel }: CardMatcherProps) {
  const maxCardWidthCssPx = Math.min(
    ABSOLUTE_MAX_CARD_WIDTH_CSS_PX,
    deviceContext.viewportWidthCssPx - 64,
  );

  const [cardWidthCssPx, setCardWidthCssPx] = useState(() =>
    Math.min(DEFAULT_CARD_WIDTH_CSS_PX, Math.max(MIN_CARD_WIDTH_CSS_PX, maxCardWidthCssPx)),
  );

  const clampedCardWidthCssPx = Math.min(
    maxCardWidthCssPx,
    Math.max(MIN_CARD_WIDTH_CSS_PX, cardWidthCssPx),
  );

  const cssPxPerMm = cssPxPerMmFromCardWidth(clampedCardWidthCssPx);
  const heightCssPx = cardHeightCssPxFromWidth(clampedCardWidthCssPx);
  const cornerRadiusCssPx = mmToCssPx(CARD_CORNER_RADIUS_MM, cssPxPerMm);
  const pitchMm = pixelPitchMm(cssPxPerMm, deviceContext.devicePixelRatio);
  const screenSize = screenPhysicalSizeMm(
    deviceContext.screenWidthCssPx,
    deviceContext.screenHeightCssPx,
    cssPxPerMm,
  );
  const plausibility = isPlausiblePixelPitch(pitchMm);
  const diagonalRounded = Math.round(screenSize.diagonalInches);

  function clampWidth(nextCssPx: number): number {
    return Math.min(maxCardWidthCssPx, Math.max(MIN_CARD_WIDTH_CSS_PX, nextCssPx));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const stepCssPx = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setCardWidthCssPx((current) => clampWidth(current - stepCssPx));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setCardWidthCssPx((current) => clampWidth(current + stepCssPx));
    }
  }

  function handleConfirm(): void {
    const calibration: Calibration = {
      cssPxPerMm,
      cardWidthCssPx: clampedCardWidthCssPx,
      devicePixelRatio: deviceContext.devicePixelRatio,
      viewportWidthCssPx: deviceContext.viewportWidthCssPx,
      viewportHeightCssPx: deviceContext.viewportHeightCssPx,
      screenWidthCssPx: deviceContext.screenWidthCssPx,
      screenHeightCssPx: deviceContext.screenHeightCssPx,
      userAgent: deviceContext.userAgent,
      createdAtIso: new Date().toISOString(),
      method: "card-id1",
      verifications: [],
    };
    onConfirm(calibration);
  }

  return (
    <section className="flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3 text-left">
        <h2 className="text-xl font-semibold text-neutral-100">Match your bank card</h2>
        <ol className="list-decimal space-y-2 pl-5 text-neutral-300">
          <li>Hold a bank card flat against the screen, over the outline.</li>
          <li>
            Slide the card slightly up so you can see the bottom edge of the outline and the
            bottom edge of the card at the same time.
          </li>
          <li>
            Adjust the slider until the outline is exactly as wide as the card. The left and
            right edges should line up with the card&apos;s edges, not sit inside them.
          </li>
        </ol>
      </div>

      <div className="flex min-h-48 items-center justify-center rounded-lg bg-neutral-900/80 p-8">
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            width: `${clampedCardWidthCssPx}px`,
            height: `${heightCssPx}px`,
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: `${cornerRadiusCssPx}px`,
              borderWidth: "2px",
              borderStyle: "solid",
              borderColor: "#f8fafc",
              backgroundColor: "rgba(248, 250, 252, 0.08)",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              width: "10px",
              height: "2px",
              marginTop: "-1px",
              marginLeft: "-10px",
              backgroundColor: "#f8fafc",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              width: "10px",
              height: "2px",
              marginTop: "-1px",
              marginRight: "-10px",
              backgroundColor: "#f8fafc",
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label htmlFor="card-width-slider" className="text-sm text-neutral-400">
          Card width ({clampedCardWidthCssPx} CSS px). Arrow keys move 1 px; Shift+Arrow moves 10
          px.
        </label>
        <input
          id="card-width-slider"
          type="range"
          min={MIN_CARD_WIDTH_CSS_PX}
          max={maxCardWidthCssPx}
          step={1}
          value={clampedCardWidthCssPx}
          onChange={(event) => setCardWidthCssPx(clampWidth(Number(event.target.value)))}
          onKeyDown={handleKeyDown}
          className="w-full accent-sky-400"
        />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-left">
        <p className="text-lg font-medium text-neutral-100">
          This looks like a {diagonalRounded} inch screen
        </p>
        <p className="text-sm text-neutral-400">
          {cssPxPerMm.toFixed(4)} CSS px per mm · pixel pitch {pitchMm.toFixed(4)} mm · estimated
          screen {screenSize.widthMm.toFixed(0)} × {screenSize.heightMm.toFixed(0)} mm (
          {screenSize.diagonalInches.toFixed(1)} in diagonal)
        </p>
        <p className="font-mono text-xs text-neutral-500">
          {[
            `DPR ${deviceContext.devicePixelRatio}`,
            `${cssPxPerMm.toFixed(4)} CSS px/mm`,
            `pitch ${pitchMm.toFixed(4)} mm`,
            `card ${clampedCardWidthCssPx.toFixed(1)} CSS px`,
            `screen ${screenSize.widthMm.toFixed(0)}×${screenSize.heightMm.toFixed(0)} mm (${screenSize.diagonalInches.toFixed(1)} in)`,
            `viewport ${deviceContext.viewportWidthCssPx}×${deviceContext.viewportHeightCssPx} CSS px`,
          ].join(" · ")}
        </p>
        {!plausibility.ok ? (
          <p className="text-sm text-amber-300" role="status">
            Check the card edges carefully. {plausibility.reason}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded bg-sky-500 px-4 py-2 font-medium text-neutral-950 hover:bg-sky-400"
        >
          Confirm
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-neutral-600 px-4 py-2 text-neutral-200 hover:border-neutral-400"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </section>
  );
}
