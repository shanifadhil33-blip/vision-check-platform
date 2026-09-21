"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  CARD_CORNER_RADIUS_MM,
  CARD_WIDTH_MM,
  cardHeightCssPxFromWidth,
  cssPxPerMmFromCardWidth,
  isPlausiblePixelPitch,
  mmToCssPx,
  pixelPitchMm,
  screenPhysicalSizeMm,
  zoomSignal,
  type Calibration,
  type DeviceContext,
} from "@/lib/calibration";
import { CARD_ZONE_MARGIN_CSS_PX, CardZone } from "./CardZone";
import { CardWidthSteppers } from "./CardWidthSteppers";

const MIN_CARD_WIDTH_CSS_PX = 120;
const ABSOLUTE_MAX_CARD_WIDTH_CSS_PX = 900;
/** Starting guess: 4.0 CSS px per mm. */
const DEFAULT_CARD_WIDTH_CSS_PX = Math.round(4 * CARD_WIDTH_MM);

const PINCH_ZOOM_MESSAGE =
  "The page is zoomed in. Use two fingers to zoom back to normal size, then press Confirm again.";

type CardMatcherProps = {
  deviceContext: DeviceContext;
  outerWidthCssPx: number;
  showDiagnostics: boolean;
  onConfirm: (calibration: Calibration) => void;
  onCancel?: (() => void) | undefined;
};

export function CardMatcher({
  deviceContext,
  outerWidthCssPx,
  showDiagnostics,
  onConfirm,
  onCancel,
}: CardMatcherProps) {
  const sliderRef = useRef<HTMLInputElement>(null);
  const [pinchBlockedMessage, setPinchBlockedMessage] = useState<string | null>(null);

  const maxCardWidthCssPx = Math.min(
    ABSOLUTE_MAX_CARD_WIDTH_CSS_PX,
    Math.max(
      MIN_CARD_WIDTH_CSS_PX,
      deviceContext.viewportWidthCssPx - CARD_ZONE_MARGIN_CSS_PX * 2,
    ),
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
  const zoom = zoomSignal(outerWidthCssPx, deviceContext.viewportWidthCssPx);
  const showSizeEstimate = zoom.state === "default" || zoom.state === "unknown";

  useEffect(() => {
    const element = sliderRef.current;
    if (element === null) {
      return;
    }

    function blockTouchStart(event: TouchEvent): void {
      event.preventDefault();
    }

    element.addEventListener("touchstart", blockTouchStart, { passive: false });
    return () => {
      element.removeEventListener("touchstart", blockTouchStart);
    };
  }, []);

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
    const visualViewport = window.visualViewport;
    if (
      visualViewport !== null &&
      visualViewport !== undefined &&
      (visualViewport.scale < 0.99 || visualViewport.scale > 1.01)
    ) {
      setPinchBlockedMessage(PINCH_ZOOM_MESSAGE);
      return;
    }
    setPinchBlockedMessage(null);

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
    <section className="flex w-full max-w-3xl flex-col items-center gap-8">
      <div className="flex w-full flex-col gap-3 text-left">
        <h2 className="text-xl font-semibold text-neutral-100">Match your bank card</h2>
        <ol className="list-decimal space-y-2 pl-5 text-neutral-300">
          <li>Hold a bank card flat against the screen, over the outline.</li>
          <li>
            Slide the card slightly up so you can see the bottom edge of the outline and the
            bottom edge of the card at the same time.
          </li>
          <li>
            Adjust the width with the buttons or slider until the outline is exactly as wide as
            the card. The left and right edges should line up with the card&apos;s edges, not sit
            inside them.
          </li>
        </ol>
      </div>

      <CardZone>
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
      </CardZone>

      <div className="flex w-full flex-col gap-4">
        <label htmlFor="card-width-slider" className="text-sm text-neutral-400">
          Card width. Use the buttons, or the arrow keys (hold Shift for bigger steps).
        </label>
        <div className="flex w-full flex-nowrap items-center gap-3">
          <CardWidthSteppers
            pair="narrower"
            minCssPx={MIN_CARD_WIDTH_CSS_PX}
            maxCssPx={maxCardWidthCssPx}
            valueCssPx={clampedCardWidthCssPx}
            onStep={(deltaCssPx) => {
              setCardWidthCssPx((current) => clampWidth(current + deltaCssPx));
            }}
          />
          <input
            ref={sliderRef}
            id="card-width-slider"
            type="range"
            min={MIN_CARD_WIDTH_CSS_PX}
            max={maxCardWidthCssPx}
            step={1}
            value={clampedCardWidthCssPx}
            onChange={(event) => setCardWidthCssPx(clampWidth(Number(event.target.value)))}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 accent-sky-400"
          />
          <CardWidthSteppers
            pair="wider"
            minCssPx={MIN_CARD_WIDTH_CSS_PX}
            maxCssPx={maxCardWidthCssPx}
            valueCssPx={clampedCardWidthCssPx}
            onStep={(deltaCssPx) => {
              setCardWidthCssPx((current) => clampWidth(current + deltaCssPx));
            }}
          />
        </div>
      </div>

      <div className="w-full text-left">
        {showSizeEstimate ? (
          <p className="text-lg font-medium text-neutral-100">
            This looks like a {diagonalRounded} inch screen
          </p>
        ) : (
          <div
            className="rounded border border-amber-300/60 bg-amber-300/10 p-3"
            role="status"
          >
            <p className="text-lg font-medium text-neutral-100">
              Set zoom to 100% and close any side panel
            </p>
            <p className="mt-1 text-sm text-neutral-300">
              Press Ctrl+0 (Cmd+0 on Mac) to reset zoom, and close any panel open at the side of the
              browser. The screen size check comes back once both are done.
            </p>
          </div>
        )}
        {showDiagnostics ? (
          <p className="mt-2 font-mono text-xs text-neutral-500">
            {[
              `DPR ${deviceContext.devicePixelRatio.toFixed(3)}`,
              `${cssPxPerMm.toFixed(4)} CSS px/mm`,
              `pitch ${pitchMm.toFixed(4)} mm`,
              `card ${clampedCardWidthCssPx.toFixed(1)} CSS px`,
              showSizeEstimate
                ? `screen ${screenSize.widthMm.toFixed(0)}×${screenSize.heightMm.toFixed(0)} mm (${screenSize.diagonalInches.toFixed(1)} in)`
                : "screen size withheld",
              `viewport ${deviceContext.viewportWidthCssPx}×${deviceContext.viewportHeightCssPx} CSS px`,
            ].join(" · ")}
          </p>
        ) : null}
        {!plausibility.ok ? (
          <p className="mt-2 text-sm text-amber-300" role="status">
            Check the card edges carefully. {plausibility.reason}
          </p>
        ) : null}
        {pinchBlockedMessage !== null ? (
          <p className="mt-2 text-sm text-amber-300" role="status">
            {pinchBlockedMessage}
          </p>
        ) : null}
      </div>

      <div className="flex w-full flex-col items-stretch gap-3">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-neutral-600 px-4 py-2 text-neutral-200 hover:border-neutral-400"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded bg-sky-500 px-4 py-2 font-medium text-neutral-950 hover:bg-sky-400"
        >
          Confirm
        </button>
      </div>
    </section>
  );
}
