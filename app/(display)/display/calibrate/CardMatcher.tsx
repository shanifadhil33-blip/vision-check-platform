"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  CARD_CORNER_RADIUS_MM,
  cardHeightCssPxFromWidth,
  cssPxPerMmFromCardWidth,
  isPlausiblePixelPitch,
  mmToCssPx,
  formatDiagnosticsLine,
  pixelPitchMm,
  screenPhysicalSizeMm,
  zoomSignal,
  type DeviceContext,
} from "@/lib/calibration";
import {
  CAL_SLIDER_HINT,
  CAL_SLIDER_LABEL,
  CAL_STEP_1,
  CAL_STEP_2,
  CAL_ZOOM_WARNING_BODY,
  outlineSizeWarning,
} from "@/lib/calibration/calibrateWording";
import { CardPlacementAnimation } from "./CardPlacementAnimation";
import { CardZone } from "./CardZone";
import { CardWidthSteppers } from "./CardWidthSteppers";
import {
  clampCardWidthCssPx,
  maxCardWidthCssPx as viewportMaxCardWidthCssPx,
  MIN_CARD_WIDTH_CSS_PX,
} from "./cardWidthLimits";
import { isPinchZoomed, PINCH_ZOOM_MESSAGE } from "./pinchGuard";

const CONFIRM_GUARD_MS = 500;

function focusOnMount(element: HTMLElement | null): void {
  element?.focus();
}

type CardMatcherProps = {
  deviceContext: DeviceContext;
  outerWidthCssPx: number;
  showDiagnostics: boolean;
  startCardWidthCssPx: number;
  matchLabel: string;
  note?: string | undefined;
  showAnimation?: boolean | undefined;
  focusHeadingOnMount?: boolean | undefined;
  onConfirm: (result: { cardWidthCssPx: number }) => void;
  onCancel?: (() => void) | undefined;
};

export function CardMatcher({
  deviceContext,
  outerWidthCssPx,
  showDiagnostics,
  startCardWidthCssPx,
  matchLabel,
  note,
  showAnimation,
  focusHeadingOnMount,
  onConfirm,
  onCancel,
}: CardMatcherProps) {
  const sliderRef = useRef<HTMLInputElement>(null);
  const [pinchBlockedMessage, setPinchBlockedMessage] = useState<string | null>(null);
  const [confirmReady, setConfirmReady] = useState(false);
  const [widthAdjusted, setWidthAdjusted] = useState(false);

  const maxCardWidthCssPx = viewportMaxCardWidthCssPx(deviceContext.viewportWidthCssPx);

  const [cardWidthCssPx, setCardWidthCssPx] = useState(() =>
    clampCardWidthCssPx(startCardWidthCssPx, maxCardWidthCssPx),
  );

  const clampedCardWidthCssPx = clampCardWidthCssPx(cardWidthCssPx, maxCardWidthCssPx);

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
  const outlineWarning = widthAdjusted ? outlineSizeWarning(plausibility) : null;
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setConfirmReady(true);
    }, CONFIRM_GUARD_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  function clampWidth(nextCssPx: number): number {
    return clampCardWidthCssPx(nextCssPx, maxCardWidthCssPx);
  }

  function adjustWidth(nextCssPx: (currentCssPx: number) => number): void {
    setWidthAdjusted(true);
    setCardWidthCssPx((current) => clampWidth(nextCssPx(current)));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const stepCssPx = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustWidth((current) => current - stepCssPx);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustWidth((current) => current + stepCssPx);
    }
  }

  function handleConfirm(): void {
    if (!confirmReady) {
      return;
    }
    if (isPinchZoomed()) {
      setPinchBlockedMessage(PINCH_ZOOM_MESSAGE);
      return;
    }
    setPinchBlockedMessage(null);
    onConfirm({ cardWidthCssPx: clampedCardWidthCssPx });
  }

  return (
    <section className="flex w-full max-w-3xl flex-col items-center gap-8">
      <div className="flex w-full flex-col gap-3 text-left">
        <p className="w-fit rounded-full bg-sky-500/15 px-3 py-1 text-base font-semibold text-sky-300">{matchLabel}</p>
        <h2
          ref={focusHeadingOnMount === true ? focusOnMount : undefined}
          tabIndex={-1}
          className="text-xl font-semibold text-neutral-100 outline-none"
        >
          Match your bank card
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {note !== undefined ? (
              <p ref={focusOnMount} tabIndex={-1} className="text-base text-neutral-300 outline-none">
                {note}
              </p>
            ) : null}
            <ol className="list-decimal space-y-2 pl-5 text-neutral-300">
              <li>{CAL_STEP_1}</li>
              <li>{CAL_STEP_2}</li>
            </ol>
          </div>
          {showAnimation === true ? (
            <div className="order-first sm:order-last">
              <CardPlacementAnimation />
            </div>
          ) : null}
        </div>
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
          {CAL_SLIDER_LABEL}
        </label>
        <p id="card-width-slider-hint" className="sr-only">
          {CAL_SLIDER_HINT}
        </p>
        <div className="flex w-full flex-nowrap items-center gap-3">
          <CardWidthSteppers
            pair="narrower"
            minCssPx={MIN_CARD_WIDTH_CSS_PX}
            maxCssPx={maxCardWidthCssPx}
            valueCssPx={clampedCardWidthCssPx}
            onStep={(deltaCssPx) => {
              adjustWidth((current) => current + deltaCssPx);
            }}
          />
          <input
            ref={sliderRef}
            id="card-width-slider"
            aria-describedby="card-width-slider-hint"
            aria-valuetext={`${Math.round(clampedCardWidthCssPx)} pixels wide`}
            type="range"
            min={MIN_CARD_WIDTH_CSS_PX}
            max={maxCardWidthCssPx}
            step={1}
            value={clampedCardWidthCssPx}
            onChange={(event) => {
              const nextCssPx = Number(event.target.value);
              adjustWidth(() => nextCssPx);
            }}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 accent-sky-400"
          />
          <CardWidthSteppers
            pair="wider"
            minCssPx={MIN_CARD_WIDTH_CSS_PX}
            maxCssPx={maxCardWidthCssPx}
            valueCssPx={clampedCardWidthCssPx}
            onStep={(deltaCssPx) => {
              adjustWidth((current) => current + deltaCssPx);
            }}
          />
        </div>
      </div>

      <div className="w-full text-left">
        {showSizeEstimate ? (
          showDiagnostics ? (
            <p className="text-lg font-medium text-neutral-100">
              This looks like a {diagonalRounded} inch screen
            </p>
          ) : null
        ) : (
          <div
            className="rounded border border-amber-300/60 bg-amber-300/10 p-3"
            role="status"
          >
            <p className="text-lg font-medium text-neutral-100">
              Set zoom to 100% and close any side panel
            </p>
            <p className="mt-1 text-sm text-neutral-300">{CAL_ZOOM_WARNING_BODY}</p>
          </div>
        )}
        {showDiagnostics ? (
          <p className="mt-2 font-mono text-xs text-neutral-500">
            {formatDiagnosticsLine({
              devicePixelRatio: deviceContext.devicePixelRatio,
              cssPxPerMm,
              cardWidthCssPx: clampedCardWidthCssPx,
              screenWidthCssPx: deviceContext.screenWidthCssPx,
              screenHeightCssPx: deviceContext.screenHeightCssPx,
              viewportWidthCssPx: deviceContext.viewportWidthCssPx,
              viewportHeightCssPx: deviceContext.viewportHeightCssPx,
              includeScreenSize: showSizeEstimate,
            })}
          </p>
        ) : null}
        <div role="status">
          {outlineWarning !== null ? (
            <p className="mt-2 text-sm text-amber-300">{outlineWarning}</p>
          ) : null}
        </div>
        {showDiagnostics && !plausibility.ok ? (
          <p className="mt-2 font-mono text-xs text-neutral-500">{plausibility.reason}</p>
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
          disabled={!confirmReady}
          className="rounded bg-sky-500 px-4 py-2 font-medium text-neutral-950 hover:bg-sky-400"
        >
          Confirm
        </button>
      </div>
    </section>
  );
}
