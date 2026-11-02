"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { mmToCssPx, pixelPitchMm } from "@/lib/calibration";
import { zoomSignal } from "@/lib/calibration/zoomSignal";
import { letterHeightMmForLogMar } from "@/lib/acuity/logmar";
import { customerLabelForStep } from "@/lib/acuity/resultLabel";
import {
  COARSEST_TESTED_STEP_INDEX,
  FINEST_TESTED_STEP_INDEX,
  computeTestLevels,
} from "@/lib/acuity/testLevels";
import {
  SIZE_CHECK_AREA_MARGIN_CSS_PX,
  SIZE_CHECK_DISTANCES_MM,
  distanceText,
  drawnValueText,
  formatLogMar,
  formatMm,
  labelGeometryText,
  screenPixelSizeText,
  SIZE_CHECK_LETTER_LABELS,
  sizeCheckAreaHeightCssPx,
  sizeCheckCopyText,
  sizeCheckFormat,
  sizeCheckIntro,
  sizeCheckRingValues,
  sizeCheckStep,
  sizeValues,
  shouldIgnorePointer,
  type SizeCheckDistanceMm,
  type SizeCheckLetter,
} from "@/lib/acuity/sizeCheck";
import { TripletCanvas } from "../../test/TripletCanvas";
import type { OptotypeMeasurement } from "../../optotype/OptotypeCanvas";
import { LandoltCanvas, type LandoltMeasurement } from "../../landolt/LandoltCanvas";
import { useCalibration } from "../../calibrate/useCalibration";

const DEFAULT_DISTANCE_MM: SizeCheckDistanceMm = 3000;
const DEFAULT_LETTER: SizeCheckLetter = "H";
const LETTERS: readonly SizeCheckLetter[] = ["H", "Z", "landolt"];
const MEASURING_DELAY_MS = 300;
const COPIED_DURATION_MS = 2000;

const SIZE_STEP_INDICES_DESCENDING: readonly number[] = Array.from(
  { length: COARSEST_TESTED_STEP_INDEX - FINEST_TESTED_STEP_INDEX + 1 },
  (_, offset) => COARSEST_TESTED_STEP_INDEX - offset,
);

const MAIN_CLASS =
  "mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10";
const BODY_CLASS = "text-base leading-relaxed text-neutral-300";
const HEADING_CLASS = "text-2xl font-semibold text-neutral-100";
const BUTTON_CLASS =
  "rounded bg-sky-600 px-4 py-3 text-base font-medium text-white hover:bg-sky-500";
const LINK_CLASS = "text-sky-400 underline underline-offset-4 hover:text-sky-300";
const OPTION_BASE_CLASS =
  "min-h-11 min-w-11 rounded border px-4 py-2 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400";
const OPTION_SELECTED_CLASS = "border-sky-300 bg-sky-600 text-white ring-2 ring-sky-300";
const OPTION_IDLE_CLASS =
  "border-neutral-600 bg-neutral-900 text-neutral-100 hover:bg-neutral-800";
const OPTION_DISABLED_CLASS =
  "cursor-not-allowed border-neutral-800 bg-neutral-950 text-neutral-600";

const HEADING = "Letter size check";
const CHECK_LINK = "Screen drawing check";
const MEASURING = "Measuring\u2026";
const NOT_SET_UP =
  "This screen isn\u2019t set up, so true millimetres can\u2019t be shown. Set up your screen first.";
const SET_UP_LINK = "Set up your screen";
const ZOOM_WARNING =
  "Your browser zoom isn\u2019t at 100%. Reset it to 100% (press Ctrl+0, or Cmd+0 on a Mac) and close any side panel.";
const DISTANCE_GROUP = "Test distance";
const LETTER_GROUP = "Letter";
const IGNORE_TOUCHES = "Ignore touches while measuring";
const IGNORE_TOUCHES_HINT = "Mouse and keyboard still work.";
const SIZE_GROUP = "Size";
const GREYED_NOTE =
  "Sizes that don\u2019t fit this window at this distance are greyed out.";
const NO_SIZES_FIT =
  "No test sizes fit this window at this distance. Make the browser window full size, or choose the other distance.";
const COPY_BUTTON = "Copy values";
const COPIED_BUTTON = "Copied";
const COPY_FAILED =
  "Couldn\u2019t copy. Select the text below and copy it instead.";
const VALUES_LABEL = "Values text";

type CopyState = "idle" | "copied" | "failed";

type ScreenInputs = {
  cssPxPerMm: number;
  devicePixelRatio: number;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  userAgent: string;
};

function drawableStepIndicesFor(
  distanceMm: SizeCheckDistanceMm,
  screen: ScreenInputs,
  letter: SizeCheckLetter,
): number[] {
  try {
    return computeTestLevels({
      distanceMm,
      pixelPitchMm: pixelPitchMm(screen.cssPxPerMm, screen.devicePixelRatio),
      cssPxPerMm: screen.cssPxPerMm,
      viewportWidthCssPx: screen.viewportWidthCssPx,
      viewportHeightCssPx: screen.viewportHeightCssPx,
      format: sizeCheckFormat(letter),
    }).stepIndices;
  } catch {
    return [];
  }
}

function optionClass(selected: boolean, disabled: boolean): string {
  if (disabled) {
    return `${OPTION_BASE_CLASS} ${OPTION_DISABLED_CLASS}`;
  }
  return `${OPTION_BASE_CLASS} ${selected ? OPTION_SELECTED_CLASS : OPTION_IDLE_CLASS}`;
}

function OptionGroup({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className={BODY_CLASS}>
        {label}
      </p>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}

function ValueRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-neutral-800 py-2">
      <dt className="text-sm text-neutral-400">{term}</dt>
      <dd className="text-base tabular-nums text-neutral-100">{value}</dd>
    </div>
  );
}

export default function SizeCheckClient() {
  const { ready, calibration, validity, deviceContext, outerWidthCssPx } = useCalibration();
  const [measuringDelayPassed, setMeasuringDelayPassed] = useState(false);
  const [distanceMm, setDistanceMm] = useState<SizeCheckDistanceMm>(DEFAULT_DISTANCE_MM);
  const [letter, setLetter] = useState<SizeCheckLetter>(DEFAULT_LETTER);
  const [preferredStepIndex, setPreferredStepIndex] = useState<number | null>(null);
  const [measurement, setMeasurement] = useState<{
    key: string;
    inkHeightDevicePx: number;
  } | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [ignoreTouches, setIgnoreTouches] = useState(false);
  const [dateIso] = useState(() =>
    typeof window === "undefined" ? "" : new Date().toISOString().slice(0, 10),
  );
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMeasuringDelayPassed(true);
    }, MEASURING_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!ignoreTouches) {
      return;
    }
    let lastPointerType: string | null = null;
    let lastPointerDownTimeStampMs: number | null = null;

    const stop = (event: Event): void => {
      event.stopPropagation();
      event.preventDefault();
    };
    const handlePointerDown = (event: PointerEvent): void => {
      lastPointerType = event.pointerType;
      lastPointerDownTimeStampMs = event.timeStamp;
      if (
        shouldIgnorePointer({
          ignoring: true,
          eventPointerType: event.pointerType,
          lastPointerType: null,
          msSinceLastPointerDown: null,
        })
      ) {
        stop(event);
      }
    };
    const handleClick = (event: MouseEvent): void => {
      if (
        shouldIgnorePointer({
          ignoring: true,
          eventPointerType: event instanceof PointerEvent ? event.pointerType : null,
          lastPointerType,
          msSinceLastPointerDown:
            lastPointerDownTimeStampMs === null
              ? null
              : event.timeStamp - lastPointerDownTimeStampMs,
        })
      ) {
        stop(event);
      }
    };
    const handleTouchStart = (event: TouchEvent): void => {
      event.preventDefault();
    };

    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("click", handleClick, { capture: true });
    // Window touch listeners default to passive in some browsers, which would ignore preventDefault.
    window.addEventListener("touchstart", handleTouchStart, { capture: true, passive: false });
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("click", handleClick, { capture: true });
      window.removeEventListener("touchstart", handleTouchStart, { capture: true });
    };
  }, [ignoreTouches]);

  const setUpCalibration = calibration !== null && validity?.ok === true ? calibration : null;
  const zoomState =
    deviceContext !== null && outerWidthCssPx !== null
      ? zoomSignal(outerWidthCssPx, deviceContext.viewportWidthCssPx).state
      : "unknown";

  // The only gate for drawing: every size, value and the canvas read from this object.
  const screen: ScreenInputs | null =
    setUpCalibration !== null && deviceContext !== null && zoomState !== "not-default"
      ? {
          cssPxPerMm: setUpCalibration.cssPxPerMm,
          devicePixelRatio: setUpCalibration.devicePixelRatio,
          viewportWidthCssPx: deviceContext.viewportWidthCssPx,
          viewportHeightCssPx: deviceContext.viewportHeightCssPx,
          userAgent: deviceContext.userAgent,
        }
      : null;

  const drawableStepIndices =
    screen === null ? [] : drawableStepIndicesFor(distanceMm, screen, letter);
  const stepIndex = sizeCheckStep(preferredStepIndex, drawableStepIndices);
  const values = stepIndex === null ? null : sizeValues(stepIndex, distanceMm);
  const measureKey =
    screen === null || values === null
      ? null
      : [distanceMm, values.stepIndex, letter, screen.cssPxPerMm, screen.devicePixelRatio].join(
          "|",
        );

  const handleMeasured = useCallback(
    (result: OptotypeMeasurement) => {
      if (measureKey === null) {
        return;
      }
      setMeasurement({
        key: measureKey,
        inkHeightDevicePx: result.inkBounds === null ? 0 : result.inkBounds.heightPx,
      });
    },
    [measureKey],
  );

  const handleLandoltMeasured = useCallback(
    (result: LandoltMeasurement) => {
      if (measureKey === null) {
        return;
      }
      setMeasurement({
        key: measureKey,
        inkHeightDevicePx: result.inkBounds === null ? 0 : result.inkBounds.heightPx,
      });
    },
    [measureKey],
  );

  if (!ready || deviceContext === null) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <main className={MAIN_CLASS}>
          <h1 className={HEADING_CLASS}>{HEADING}</h1>
          {measuringDelayPassed && <p className={BODY_CLASS}>{MEASURING}</p>}
        </main>
      </div>
    );
  }

  if (setUpCalibration === null) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <main className={MAIN_CLASS}>
          <h1 className={HEADING_CLASS}>{HEADING}</h1>
          <p className={BODY_CLASS}>{NOT_SET_UP}</p>
          <Link href="/display/calibrate" className={LINK_CLASS}>
            {SET_UP_LINK}
          </Link>
        </main>
      </div>
    );
  }

  if (zoomState === "not-default" || screen === null) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <main className={MAIN_CLASS}>
          <h1 className={HEADING_CLASS}>{HEADING}</h1>
          <p className={BODY_CLASS} aria-live="polite">
            {ZOOM_WARNING}
          </p>
        </main>
      </div>
    );
  }

  const inkHeightDevicePx =
    measurement !== null && measurement.key === measureKey ? measurement.inkHeightDevicePx : null;
  const anyDisabled = drawableStepIndices.length < SIZE_STEP_INDICES_DESCENDING.length;
  const areaMinHeightCssPx =
    drawableStepIndices.length === 0
      ? 0
      : sizeCheckAreaHeightCssPx(
          mmToCssPx(
            letterHeightMmForLogMar(Math.max(...drawableStepIndices) / 10, distanceMm),
            screen.cssPxPerMm,
          ),
        );
  const copyText =
    values === null
      ? ""
      : sizeCheckCopyText({
          values,
          distanceMm,
          letter,
          drawnDevicePx: inkHeightDevicePx,
          cssPxPerMm: screen.cssPxPerMm,
          devicePixelRatio: screen.devicePixelRatio,
          dateIso,
          userAgent: screen.userAgent,
        });

  const chooseDistance = (nextDistanceMm: SizeCheckDistanceMm): void => {
    if (nextDistanceMm === distanceMm) {
      return;
    }
    setDistanceMm(nextDistanceMm);
    setPreferredStepIndex(
      sizeCheckStep(stepIndex, drawableStepIndicesFor(nextDistanceMm, screen, letter)),
    );
  };

  const chooseLetter = (nextLetter: SizeCheckLetter): void => {
    if (nextLetter === letter) {
      return;
    }
    setLetter(nextLetter);
    setPreferredStepIndex(
      sizeCheckStep(stepIndex, drawableStepIndicesFor(distanceMm, screen, nextLetter)),
    );
  };

  const ringValues = values !== null && letter === "landolt" ? sizeCheckRingValues(values, distanceMm) : null;

  async function copyValues(): Promise<void> {
    if (copiedTimerRef.current !== null) {
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
    try {
      if (navigator.clipboard?.writeText === undefined) {
        setCopyState("failed");
        return;
      }
      await navigator.clipboard.writeText(copyText);
      setCopyState("copied");
      copiedTimerRef.current = setTimeout(() => {
        setCopyState("idle");
        copiedTimerRef.current = null;
      }, COPIED_DURATION_MS);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className={MAIN_CLASS}>
        <h1 className={HEADING_CLASS}>{HEADING}</h1>
        <p className={BODY_CLASS}>{sizeCheckIntro(letter)}</p>
        <Link href="/display/check" className={LINK_CLASS}>
          {CHECK_LINK}
        </Link>
        <OptionGroup id="size-check-distance" label={DISTANCE_GROUP}>
          {SIZE_CHECK_DISTANCES_MM.map((optionDistanceMm) => {
            const selected = optionDistanceMm === distanceMm;
            return (
              <button
                key={optionDistanceMm}
                type="button"
                aria-pressed={selected}
                className={optionClass(selected, false)}
                onClick={() => {
                  chooseDistance(optionDistanceMm);
                }}
              >
                {distanceText(optionDistanceMm)}
              </button>
            );
          })}
        </OptionGroup>
        <p className="text-2xl font-semibold text-neutral-100">
          {`Showing sizes for ${distanceText(distanceMm)}`}
        </p>
        <OptionGroup id="size-check-letter" label={LETTER_GROUP}>
          {LETTERS.map((optionLetter) => {
            const selected = optionLetter === letter;
            return (
              <button
                key={optionLetter}
                type="button"
                aria-pressed={selected}
                className={optionClass(selected, false)}
                onClick={() => {
                  chooseLetter(optionLetter);
                }}
              >
                {SIZE_CHECK_LETTER_LABELS[optionLetter]}
              </button>
            );
          })}
        </OptionGroup>
        <div className="flex flex-col gap-1">
          <label className={`flex min-h-11 cursor-pointer items-center gap-3 ${BODY_CLASS}`}>
            <input
              type="checkbox"
              checked={ignoreTouches}
              aria-describedby="size-check-ignore-touches-hint"
              className="h-5 w-5 accent-sky-600"
              onChange={(event) => {
                setIgnoreTouches(event.target.checked);
              }}
            />
            {IGNORE_TOUCHES}
          </label>
          <p id="size-check-ignore-touches-hint" className="text-sm text-neutral-400">
            {IGNORE_TOUCHES_HINT}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <OptionGroup id="size-check-size" label={SIZE_GROUP}>
            {SIZE_STEP_INDICES_DESCENDING.map((optionStepIndex) => {
              const disabled = !drawableStepIndices.includes(optionStepIndex);
              const selected = optionStepIndex === stepIndex;
              return (
                <button
                  key={optionStepIndex}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  className={optionClass(selected, disabled)}
                  onClick={() => {
                    setPreferredStepIndex(optionStepIndex);
                  }}
                >
                  {customerLabelForStep(optionStepIndex)}
                </button>
              );
            })}
          </OptionGroup>
          {anyDisabled && <p className={BODY_CLASS}>{GREYED_NOTE}</p>}
        </div>
      </main>
      {drawableStepIndices.length === 0 && (
        <div className={MAIN_CLASS}>
          <p className={BODY_CLASS}>{NO_SIZES_FIT}</p>
        </div>
      )}
      {values !== null && (
        <>
          <div
            className="flex w-full items-center justify-center bg-white"
            style={{
              minHeight: `${areaMinHeightCssPx}px`,
              paddingTop: `${SIZE_CHECK_AREA_MARGIN_CSS_PX}px`,
              paddingBottom: `${SIZE_CHECK_AREA_MARGIN_CSS_PX}px`,
              boxSizing: "border-box",
            }}
          >
            {letter === "landolt" ? (
              <LandoltCanvas
                trialIndex={0}
                direction="right"
                stepIndex={values.stepIndex}
                distanceMm={distanceMm}
                cssPxPerMm={screen.cssPxPerMm}
                devicePixelRatio={screen.devicePixelRatio}
                onMeasured={handleLandoltMeasured}
              />
            ) : (
              <TripletCanvas
                left="D"
                target={letter}
                right="K"
                logMar={values.logMar}
                distanceMm={distanceMm}
                cssPxPerMm={screen.cssPxPerMm}
                devicePixelRatio={screen.devicePixelRatio}
                onMeasured={handleMeasured}
              />
            )}
          </div>
          <div className={MAIN_CLASS}>
            <dl className="flex flex-col">
              <ValueRow term="Snellen label" value={values.label} />
              <ValueRow term="Exact logMAR" value={formatLogMar(values.logMar)} />
              <ValueRow term="Expected letter height" value={formatMm(values.heightMm)} />
              <ValueRow term="Expected stroke width" value={formatMm(values.strokeMm)} />
              {ringValues !== null && (
                <>
                  <ValueRow term="Ring outer diameter" value={formatMm(ringValues.outerDiameterMm)} />
                  <ValueRow term="Ring width" value={formatMm(ringValues.ringWidthMm)} />
                  <ValueRow term="Gap width" value={formatMm(ringValues.gapWidthMm)} />
                </>
              )}
              <ValueRow
                term="From the rounded label (standard Snellen geometry)"
                value={labelGeometryText(values)}
              />
              <ValueRow
                term="Drawn on this screen"
                value={
                  inkHeightDevicePx === null
                    ? MEASURING
                    : drawnValueText(inkHeightDevicePx, screen.cssPxPerMm, screen.devicePixelRatio)
                }
              />
              <ValueRow
                term="Screen pixel size"
                value={screenPixelSizeText(screen.cssPxPerMm, screen.devicePixelRatio)}
              />
              <ValueRow
                term={`At ${distanceText(values.otherDistanceMm)}`}
                value={`this size is ${formatMm(values.otherHeightMm)}`}
              />
            </dl>
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => {
                void copyValues();
              }}
            >
              {copyState === "copied" ? COPIED_BUTTON : COPY_BUTTON}
            </button>
            <div aria-live="polite">
              {copyState === "failed" && <p className={BODY_CLASS}>{COPY_FAILED}</p>}
            </div>
            <label className={`flex flex-col gap-2 ${BODY_CLASS}`}>
              {VALUES_LABEL}
              <textarea
                readOnly
                value={copyText}
                rows={copyText.split("\n").length}
                spellCheck={false}
                className="w-full resize-y rounded border border-neutral-600 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100"
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
