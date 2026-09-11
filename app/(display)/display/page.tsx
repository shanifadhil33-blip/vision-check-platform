"use client";

import Link from "next/link";
import { useCalibration } from "./calibrate/useCalibration";

export default function DisplayPage() {
  const { ready, calibration, validity } = useCalibration();

  let statusLine = "Checking calibration…";
  if (ready) {
    if (calibration === null) {
      statusLine = "No calibration yet.";
    } else if (validity?.ok) {
      statusLine = `Valid calibration · ${calibration.cssPxPerMm.toFixed(2)} CSS px per mm.`;
    } else {
      statusLine = `Calibration stored but not valid on this display${validity ? `: ${validity.reason}` : "."}`;
    }
  }

  return (
    <main className="mx-auto flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-neutral-100">Display</h1>
      <p className="max-w-md text-neutral-400">{statusLine}</p>
      <Link
        href="/display/calibrate"
        className="text-sky-400 underline underline-offset-4 hover:text-sky-300"
      >
        /display/calibrate
      </Link>
      <Link
        href="/display/optotype"
        className="text-sky-400 underline underline-offset-4 hover:text-sky-300"
      >
        /display/optotype
      </Link>
      <Link
        href="/display/range"
        className="text-sky-400 underline underline-offset-4 hover:text-sky-300"
      >
        /display/range
      </Link>
      <Link
        href="/display/session"
        className="text-sky-400 underline underline-offset-4 hover:text-sky-300"
      >
        Session test
      </Link>
      <Link
        href="/display/test"
        className="text-sky-400 underline underline-offset-4 hover:text-sky-300"
      >
        Two-device test
      </Link>
    </main>
  );
}
