"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { pixelPitchMm } from "@/lib/calibration";
import { zoomSignal } from "@/lib/calibration/zoomSignal";
import {
  NOMINAL_CSS_PX_PER_MM,
  buildResultsText,
  requestedDevicePx,
  signedDifference,
  smallestSizeLine,
  withinOnePixel,
  type DrawCheckRow,
  type ResultsTextInput,
} from "@/lib/acuity/drawCheck";
import { customerLabelForStep } from "@/lib/acuity/resultLabel";
import { computeTestLevels } from "@/lib/acuity/testLevels";
import { TripletCanvas } from "../test/TripletCanvas";
import type { OptotypeMeasurement } from "../optotype/OptotypeCanvas";
import { useCalibration } from "../calibrate/useCalibration";

const DISTANCE_MM = 2000;

const MAIN_CLASS =
  "mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10";
const BODY_CLASS = "text-base leading-relaxed text-neutral-300";
const HEADING_CLASS = "text-2xl font-semibold text-neutral-100";
const BUTTON_CLASS =
  "rounded bg-sky-600 px-4 py-3 text-base font-medium text-white hover:bg-sky-500";
const LINK_CLASS = "text-sky-400 underline underline-offset-4 hover:text-sky-300";

const HEADING = "Screen drawing check";
const INTRO =
  "This page draws the test letters at the sizes the test uses at 2 m, measures each one and shows the numbers. Keep the browser zoom at 100%. When the table appears, press Copy results and paste them into a message to John.";
const ZOOM_WARNING =
  "Your browser zoom isn't at 100%, so these numbers don't count. Reset the zoom to 100% and reload this page.";
const NOT_SET_UP =
  "This screen isn't set up, so the letters use a standard size rather than true millimetres. The pixel check below still counts. To check true millimetres, set up your screen first.";
const SET_UP_LINK = "Set up your screen";
const MEASURING = "Measuring\u2026";
const NO_LEVELS = "No test sizes fit this window.";
const SMALLEST_HEADING = "Smallest test size this screen can show";
const NOT_SET_UP_SMALLEST = "Set up your screen to see this.";
const COPY_BUTTON = "Copy results";
const COPIED_BUTTON = "Copied";
const COPY_FAILED =
  "Couldn't copy. Select the text below and copy it instead.";
const NOT_COUNTED_SUMMARY = "Not counted, because the browser zoom isn't at 100%.";
const RESULTS_LABEL = "Results text";

type CopyState = "idle" | "copied" | "failed";

type Capture = {
  devicePixelRatio: number;
  innerWidthCssPx: number;
  innerHeightCssPx: number;
  screenWidthCssPx: number;
  screenHeightCssPx: number;
  userAgent: string;
  cssPxPerMm: number;
  screenSetUp: boolean;
  zoom: ResultsTextInput["zoom"];
  dateIso: string;
  stepIndicesDescending: number[];
};

type LevelProbeProps = {
  stepIndex: number;
  cssPxPerMm: number;
  devicePixelRatio: number;
  onRecord: (row: DrawCheckRow) => void;
};

function LevelProbe({
  stepIndex,
  cssPxPerMm,
  devicePixelRatio,
  onRecord,
}: LevelProbeProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const recordedRef = useRef(false);

  const handleMeasured = useCallback(
    (measurement: OptotypeMeasurement) => {
      if (recordedRef.current) {
        return;
      }
      const wrapperDiv = wrapperRef.current;
      if (wrapperDiv === null) {
        return;
      }
      const canvas = wrapperDiv.querySelector("canvas");
      if (canvas === null) {
        return;
      }
      const inkBounds = measurement.inkBounds;
      recordedRef.current = true;
      onRecord({
        stepIndex,
        askedForDevicePx: requestedDevicePx(
          stepIndex,
          DISTANCE_MM,
          cssPxPerMm,
          devicePixelRatio,
        ),
        drawnDevicePx: inkBounds === null ? 0 : inkBounds.heightPx,
        layoutDevicePx: canvas.getBoundingClientRect().height * devicePixelRatio,
        canvasHeightDevicePx: measurement.canvasHeightDevicePx,
      });
    },
    [cssPxPerMm, devicePixelRatio, onRecord, stepIndex],
  );

  return (
    <div className="flex flex-col gap-2">
      <p className={BODY_CLASS}>{customerLabelForStep(stepIndex)}</p>
      <div ref={wrapperRef} className="w-fit bg-white">
        <TripletCanvas
          left="D"
          target="H"
          right="K"
          logMar={stepIndex / 10}
          distanceMm={DISTANCE_MM}
          cssPxPerMm={cssPxPerMm}
          devicePixelRatio={devicePixelRatio}
          onMeasured={handleMeasured}
        />
      </div>
    </div>
  );
}

export default function CheckClient() {
  const { ready, calibration, validity } = useCalibration();
  const capturedOnce = useRef(false);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [records, setRecords] = useState<DrawCheckRow[]>([]);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    if (!ready || capturedOnce.current) {
      return;
    }
    const devicePixelRatio = window.devicePixelRatio;
    const innerWidthCssPx = window.innerWidth;
    const innerHeightCssPx = window.innerHeight;
    const screenSetUp = calibration !== null && validity?.ok === true;
    const cssPxPerMm = screenSetUp ? calibration.cssPxPerMm : NOMINAL_CSS_PX_PER_MM;
    const levels = computeTestLevels({
      distanceMm: DISTANCE_MM,
      pixelPitchMm: pixelPitchMm(cssPxPerMm, devicePixelRatio),
      cssPxPerMm,
      viewportWidthCssPx: innerWidthCssPx,
      viewportHeightCssPx: innerHeightCssPx,
      format: "flanked-triplet",
    });
    capturedOnce.current = true;
    setCapture({
      devicePixelRatio,
      innerWidthCssPx,
      innerHeightCssPx,
      screenWidthCssPx: window.screen.width,
      screenHeightCssPx: window.screen.height,
      userAgent: navigator.userAgent,
      cssPxPerMm,
      screenSetUp,
      zoom: zoomSignal(window.outerWidth, window.innerWidth),
      dateIso: new Date().toISOString().slice(0, 10),
      stepIndicesDescending: [...levels.stepIndices].sort((a, b) => b - a),
    });
  }, [ready, calibration, validity]);

  const handleRecord = useCallback((row: DrawCheckRow) => {
    setRecords((current) => {
      if (current.some((item) => item.stepIndex === row.stepIndex)) {
        return current;
      }
      return [...current, row];
    });
  }, []);

  const finished =
    capture !== null && records.length === capture.stepIndicesDescending.length;

  const ordered = [...records].sort((a, b) => b.stepIndex - a.stepIndex);
  const withinCount = ordered.filter((row) =>
    withinOnePixel(row.askedForDevicePx, row.drawnDevicePx),
  ).length;

  const resultsText =
    capture !== null && finished
      ? buildResultsText({
          dateIso: capture.dateIso,
          userAgent: capture.userAgent,
          devicePixelRatio: capture.devicePixelRatio,
          innerWidthCssPx: capture.innerWidthCssPx,
          innerHeightCssPx: capture.innerHeightCssPx,
          screenWidthCssPx: capture.screenWidthCssPx,
          screenHeightCssPx: capture.screenHeightCssPx,
          zoom: capture.zoom,
          screenSetUp: capture.screenSetUp,
          cssPxPerMm: capture.cssPxPerMm,
          rows: ordered,
        })
      : "";

  async function copyResults(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText === undefined) {
        setCopyState("failed");
        return;
      }
      await navigator.clipboard.writeText(resultsText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const copyLabel = copyState === "copied" ? COPIED_BUTTON : COPY_BUTTON;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className={MAIN_CLASS}>
        <h1 className={HEADING_CLASS}>{HEADING}</h1>
        <p className={BODY_CLASS}>{INTRO}</p>
        {capture?.zoom.state === "not-default" && <p className={BODY_CLASS}>{ZOOM_WARNING}</p>}
        {capture !== null && !capture.screenSetUp && (
          <>
            <p className={BODY_CLASS}>{NOT_SET_UP}</p>
            <Link href="/display/calibrate" className={LINK_CLASS}>
              {SET_UP_LINK}
            </Link>
          </>
        )}
        {capture === null && <p className={BODY_CLASS}>{MEASURING}</p>}
        {capture !== null && (
          <section className="flex flex-col gap-2">
            <h2 className={HEADING_CLASS}>{SMALLEST_HEADING}</h2>
            {capture.screenSetUp ? (
              <>
                <p className={BODY_CLASS}>
                  {`At 2 m: ${smallestSizeLine({
                    distanceMm: 2000,
                    cssPxPerMm: capture.cssPxPerMm,
                    devicePixelRatio: capture.devicePixelRatio,
                    viewportWidthCssPx: capture.innerWidthCssPx,
                    viewportHeightCssPx: capture.innerHeightCssPx,
                  })}`}
                </p>
                <p className={BODY_CLASS}>
                  {`At 3 m: ${smallestSizeLine({
                    distanceMm: 3000,
                    cssPxPerMm: capture.cssPxPerMm,
                    devicePixelRatio: capture.devicePixelRatio,
                    viewportWidthCssPx: capture.innerWidthCssPx,
                    viewportHeightCssPx: capture.innerHeightCssPx,
                  })}`}
                </p>
              </>
            ) : (
              <p className={BODY_CLASS}>{NOT_SET_UP_SMALLEST}</p>
            )}
          </section>
        )}
        {capture !== null && capture.stepIndicesDescending.length === 0 && (
          <p className={BODY_CLASS}>{NO_LEVELS}</p>
        )}
        {capture !== null && capture.stepIndicesDescending.length > 0 && !finished && (
          <p className={BODY_CLASS}>{MEASURING}</p>
        )}
      </main>
      {capture !== null && capture.stepIndicesDescending.length > 0 && (
        <div className="w-full overflow-x-auto">
          <div className="flex w-max min-w-full flex-col gap-6 px-6 pb-10">
            {capture.stepIndicesDescending.map((stepIndex) => (
              <LevelProbe
                key={stepIndex}
                stepIndex={stepIndex}
                cssPxPerMm={capture.cssPxPerMm}
                devicePixelRatio={capture.devicePixelRatio}
                onRecord={handleRecord}
              />
            ))}
            {finished && (
              <>
                <table className="w-full border-collapse text-left text-sm text-neutral-100">
                  <thead>
                    <tr className="border-b border-neutral-700">
                      <th className="px-3 py-2 font-medium" scope="col">
                        Size at 2 m
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        Asked for (screen pixels)
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        Drawn (screen pixels)
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        Difference
                      </th>
                      <th className="px-3 py-2 font-medium" scope="col">
                        Within one pixel
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((row) => (
                      <tr key={row.stepIndex} className="border-b border-neutral-800">
                        <td className="px-3 py-2">{customerLabelForStep(row.stepIndex)}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.askedForDevicePx.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row.drawnDevicePx}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {signedDifference(row.drawnDevicePx - row.askedForDevicePx)}
                        </td>
                        <td className="px-3 py-2">
                          {withinOnePixel(row.askedForDevicePx, row.drawnDevicePx) ? "Yes" : "No"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className={BODY_CLASS}>
                  {capture.zoom.state === "not-default"
                    ? NOT_COUNTED_SUMMARY
                    : `${withinCount} of ${ordered.length} sizes drawn within one screen pixel.`}
                </p>
              </>
            )}
          </div>
        </div>
      )}
      {finished && capture !== null && (
        <div className={MAIN_CLASS}>
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => {
              void copyResults();
            }}
          >
            {copyLabel}
          </button>
          {copyState === "failed" && <p className={BODY_CLASS}>{COPY_FAILED}</p>}
          <label className={`flex flex-col gap-2 ${BODY_CLASS}`}>
            {RESULTS_LABEL}
            <textarea
              readOnly
              value={resultsText}
              rows={16}
              spellCheck={false}
              className="w-full resize-y rounded border border-neutral-600 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100"
            />
          </label>
        </div>
      )}
    </div>
  );
}
