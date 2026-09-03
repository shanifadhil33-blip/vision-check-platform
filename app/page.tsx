import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold text-neutral-100">Vision Check Platform</h1>
      <p className="text-neutral-400">Phase A. Screen calibration check.</p>
      <Link
        href="/display/calibrate"
        className="w-fit rounded bg-sky-500 px-5 py-3 text-base font-medium text-neutral-950 hover:bg-sky-400"
      >
        Start screen calibration
      </Link>
      <p className="text-sm text-neutral-500">
        Best viewed in Chrome, Edge, Safari or Firefox at 100% zoom. Press Ctrl+0 (Cmd+0 on Mac)
        to reset zoom before calibrating.
      </p>
    </main>
  );
}
