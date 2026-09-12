"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { OptotypeCanvas } from "@/app/(display)/display/optotype/OptotypeCanvas";
import { useCalibration } from "@/app/(display)/display/calibrate/useCalibration";
import { TripletCanvas } from "./TripletCanvas";
import {
  beginTrials,
  dispose,
  getServerSnapshot,
  getSnapshot,
  handleCanvasMeasured,
  type SessionFormat,
  start,
  subscribe,
  watchSession,
} from "./testController";

export default function TestClient() {
  const { ready, calibration, validity } = useCalibration();
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [distanceMm, setDistanceMm] = useState<3000 | 2000>(3000);
  const [format, setFormat] = useState<SessionFormat>("flanked-triplet");

  useEffect(() => {
    return () => {
      dispose();
    };
  }, []);

  useEffect(() => {
    if (snap.sessionId !== null) {
      watchSession(snap.sessionId);
    }
  }, [snap.sessionId]);

  if (!ready) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-neutral-400">
        Checking calibration…
      </main>
    );
  }

  if (calibration === null || validity === null || !validity.ok) {
    return (
      <main className="mx-auto flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-neutral-300">A valid calibration is required before the test.</p>
        <Link
          href="/display/calibrate"
          className="text-sky-400 underline underline-offset-4 hover:text-sky-300"
        >
          /display/calibrate
        </Link>
      </main>
    );
  }

  if (
    (snap.phase === "presenting" || snap.phase === "awaiting_response") &&
    snap.currentTarget !== null
  ) {
    const logMar =
      snap.currentStepIndex === null ? 0 : snap.currentStepIndex / 10;
    const distance = snap.distanceMm ?? distanceMm;
    const cssPxPerMm = snap.cssPxPerMm ?? calibration.cssPxPerMm;
    const devicePixelRatio = snap.devicePixelRatio ?? calibration.devicePixelRatio;

    if (
      snap.format === "flanked-triplet" &&
      snap.currentLeftFlanker !== null &&
      snap.currentRightFlanker !== null
    ) {
      return (
        <main className="flex min-h-full flex-1 items-center justify-center bg-white">
          <TripletCanvas
            key={snap.currentTrialIndex ?? 0}
            left={snap.currentLeftFlanker}
            target={snap.currentTarget}
            right={snap.currentRightFlanker}
            logMar={logMar}
            distanceMm={distance}
            cssPxPerMm={cssPxPerMm}
            devicePixelRatio={devicePixelRatio}
            onMeasured={handleCanvasMeasured}
          />
        </main>
      );
    }

    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-white">
        <OptotypeCanvas
          key={snap.currentTrialIndex ?? 0}
          letter={snap.currentTarget}
          logMar={logMar}
          distanceMm={distance}
          cssPxPerMm={cssPxPerMm}
          devicePixelRatio={devicePixelRatio}
          onMeasured={handleCanvasMeasured}
        />
      </main>
    );
  }

  const showFlankersColumn = snap.format === "flanked-triplet";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-100">Two-device test</h1>
      <p className="text-sm text-neutral-400">
        Thin loop only: QR pair, one letter at a time, five choices on the phone.
      </p>

      {(snap.phase === "idle" || snap.phase === "error") && (
        <section className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-neutral-300">
            Format
            <select
              value={format}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "single") {
                  setFormat("single");
                  return;
                }
                setFormat("flanked-triplet");
              }}
              className="rounded border border-neutral-600 bg-neutral-950 px-3 py-2"
            >
              <option value="flanked-triplet">Flanked triplet</option>
              <option value="single">Single letter</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-300">
            Viewing distance
            <select
              value={distanceMm}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "2000") {
                  setDistanceMm(2000);
                  return;
                }
                setDistanceMm(3000);
              }}
              className="rounded border border-neutral-600 bg-neutral-950 px-3 py-2"
            >
              <option value={3000}>3 m (3000 mm)</option>
              <option value={2000}>2 m (2000 mm)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              void start(
                distanceMm,
                calibration,
                format,
                window.innerWidth,
                window.innerHeight,
              );
            }}
            className="rounded bg-sky-600 px-4 py-3 text-base font-medium text-white hover:bg-sky-500"
          >
            Start
          </button>
          {snap.phase === "error" && snap.errorMessage !== null && (
            <p className="text-sm text-red-400">{snap.errorMessage}</p>
          )}
        </section>
      )}

      {snap.phase === "creating" && (
        <p className="text-neutral-400">Creating session…</p>
      )}

      {(snap.phase === "waiting_for_phone" || snap.phase === "ready") && (
        <section className="flex flex-col items-center gap-4">
          {snap.qrDataUrl !== null && (
            <Image
              src={snap.qrDataUrl}
              alt="QR code linking to the remote phone page"
              width={280}
              height={280}
              unoptimized
              className="rounded bg-white p-2"
            />
          )}
          {snap.remoteUrl !== null && (
            <p className="w-full select-all break-all rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-sky-300">
              {snap.remoteUrl}
            </p>
          )}
          {snap.phase === "waiting_for_phone" && (
            <p className="text-neutral-400">Waiting for the phone to connect…</p>
          )}
          {snap.phase === "ready" && (
            <>
              <p className="text-emerald-400">Phone connected.</p>
              <button
                type="button"
                onClick={() => {
                  void beginTrials();
                }}
                className="rounded bg-emerald-600 px-4 py-3 text-base font-medium text-white hover:bg-emerald-500"
              >
                Start trials
              </button>
            </>
          )}
        </section>
      )}

      {snap.phase === "complete" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-neutral-100">Results</h2>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-700 text-neutral-400">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">logMAR</th>
                <th className="py-2 pr-2">Target</th>
                {showFlankersColumn && <th className="py-2 pr-2">Flankers</th>}
                <th className="py-2 pr-2">Response</th>
                <th className="py-2">OK</th>
              </tr>
            </thead>
            <tbody>
              {snap.history.map((row) => (
                <tr key={row.trialIndex} className="border-b border-neutral-800">
                  <td className="py-2 pr-2">{row.trialIndex}</td>
                  <td className="py-2 pr-2">{(row.stepIndex / 10).toFixed(1)}</td>
                  <td className="py-2 pr-2">{row.target}</td>
                  {showFlankersColumn && (
                    <td className="py-2 pr-2">
                      {row.leftFlanker !== null && row.rightFlanker !== null
                        ? `${row.leftFlanker} · ${row.rightFlanker}`
                        : "—"}
                    </td>
                  )}
                  <td className="py-2 pr-2">
                    {row.responseKind === "not_sure" ? "not sure" : row.responseLetter}
                  </td>
                  <td className="py-2">{row.correct ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {snap.phase === "error" && snap.errorMessage !== null && snap.sessionId !== null && (
        <p className="text-sm text-red-400">{snap.errorMessage}</p>
      )}
    </main>
  );
}
