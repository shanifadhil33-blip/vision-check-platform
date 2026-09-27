"use client";

import { useState, type FormEvent } from "react";
import {
  CARD_WIDTH_MM,
  cssPxPerMmFromRulerBar,
  isPlausiblePixelPitch,
  pixelPitchMm,
  rulerBarCssPx,
  type Calibration,
  type CardMatchAttempt,
  type DeviceContext,
} from "@/lib/calibration";
import { CARD_ZONE_MARGIN_CSS_PX } from "./CardZone";
import { isPinchZoomed, PINCH_ZOOM_MESSAGE_RULER } from "./pinchGuard";

const INVALID_LENGTH_MESSAGE = "Type the length in mm, for example 98.5.";
const IMPLAUSIBLE_LENGTH_MESSAGE =
  "That length doesn't fit this screen. Measure the bar again and check the number.";

type RulerCalibrateProps = {
  cssPxPerMmEstimate: number;
  deviceContext: DeviceContext;
  showDiagnostics: boolean;
  cardMatchAttempts: CardMatchAttempt[];
  onSave: (calibration: Calibration) => void;
  onBack: () => void;
};

export function RulerCalibrate({
  cssPxPerMmEstimate,
  deviceContext,
  showDiagnostics,
  cardMatchAttempts,
  onSave,
  onBack,
}: RulerCalibrateProps) {
  const [barCssPx] = useState(() =>
    rulerBarCssPx({
      cssPxPerMmEstimate,
      maxCssPx: deviceContext.viewportWidthCssPx - CARD_ZONE_MARGIN_CSS_PX * 2,
    }),
  );
  const [measuredText, setMeasuredText] = useState("");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  function handleSave(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isPinchZoomed()) {
      setBlockedMessage(PINCH_ZOOM_MESSAGE_RULER);
      return;
    }

    const measuredRaw = Number(measuredText);
    if (!Number.isFinite(measuredRaw) || measuredRaw <= 0) {
      setBlockedMessage(INVALID_LENGTH_MESSAGE);
      return;
    }
    const measuredMm = Math.round(measuredRaw * 10) / 10;
    if (!Number.isFinite(measuredMm) || measuredMm <= 0) {
      setBlockedMessage(INVALID_LENGTH_MESSAGE);
      return;
    }

    const cssPxPerMm = cssPxPerMmFromRulerBar(barCssPx, measuredMm);
    const pitchMm = pixelPitchMm(cssPxPerMm, deviceContext.devicePixelRatio);
    if (!isPlausiblePixelPitch(pitchMm).ok) {
      setBlockedMessage(IMPLAUSIBLE_LENGTH_MESSAGE);
      return;
    }

    setBlockedMessage(null);
    const createdAtIso = new Date().toISOString();
    const calibration: Calibration = {
      cssPxPerMm,
      cardWidthCssPx: CARD_WIDTH_MM * cssPxPerMm,
      devicePixelRatio: deviceContext.devicePixelRatio,
      viewportWidthCssPx: deviceContext.viewportWidthCssPx,
      viewportHeightCssPx: deviceContext.viewportHeightCssPx,
      screenWidthCssPx: deviceContext.screenWidthCssPx,
      screenHeightCssPx: deviceContext.screenHeightCssPx,
      userAgent: deviceContext.userAgent,
      createdAtIso,
      method: "ruler-bar",
      verifications: [],
      rulerBar: {
        barCssPx,
        measuredMm,
        createdAtIso,
      },
    };
    if (cardMatchAttempts.length > 0) {
      onSave({ ...calibration, cardMatchAttempts });
      return;
    }
    onSave(calibration);
  }

  return (
    <section className="flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3 text-left">
        <h2 className="text-xl font-semibold text-neutral-100">Measure a line with a ruler</h2>
        <p className="text-neutral-300">
          Measure the bar below with a ruler and type the length you get in mm, to one decimal
          place.
        </p>
      </div>

      <div className="flex flex-col items-stretch gap-2">
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            width: `${barCssPx}px`,
            height: "40px",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transform: "translateX(-50%)",
              fontSize: "12px",
              lineHeight: "1",
              color: "#7dd3fc",
            }}
          >
            0
          </span>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "66%",
              right: 0,
              height: "2px",
              marginTop: "-1px",
              backgroundColor: "#7dd3fc",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "12px",
              width: "1px",
              height: "24px",
              backgroundColor: "#7dd3fc",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "12px",
              width: "1px",
              height: "24px",
              backgroundColor: "#7dd3fc",
            }}
          />
        </div>
        <p className="text-sm text-neutral-300">
          Line up the ruler&apos;s zero mark with the left mark, not the end of the ruler. Many
          rulers have a blank margin before zero.
        </p>
        <p className="text-sm text-neutral-500">
          Measure from the outside of the left mark to the outside of the right mark.
        </p>
      </div>

      {showDiagnostics ? (
        <p className="font-mono text-xs text-neutral-500">
          bar {barCssPx} CSS px · estimate {cssPxPerMmEstimate.toFixed(4)} CSS px/mm
        </p>
      ) : null}

      <form onSubmit={handleSave} noValidate className="flex flex-col gap-4 text-left">
        <label htmlFor="ruler-measured-mm" className="text-sm text-neutral-300">
          Measured length (mm)
        </label>
        <input
          id="ruler-measured-mm"
          type="number"
          inputMode="decimal"
          step={0.1}
          min={0}
          value={measuredText}
          onChange={(event) => setMeasuredText(event.target.value)}
          className="w-40 rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-neutral-100"
        />
        {blockedMessage !== null ? (
          <p className="text-sm text-amber-300" role="status">
            {blockedMessage}
          </p>
        ) : null}
        <div className="flex w-full flex-col items-stretch gap-3">
          <button
            type="submit"
            className="rounded bg-sky-500 px-4 py-2 font-medium text-neutral-950 hover:bg-sky-400"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded border border-neutral-600 px-4 py-2 text-neutral-200 hover:border-neutral-400"
          >
            Back to the card
          </button>
        </div>
      </form>
    </section>
  );
}
