import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold text-neutral-100">Vision Check Platform</h1>
      <p className="text-sm text-neutral-500">
        Best viewed in Chrome, Edge, Safari or Firefox at 100% zoom. Press Ctrl+0 (Cmd+0 on Mac)
        to reset zoom before calibrating.
      </p>
      <ol className="flex flex-col gap-3">
        <li>
          <Link
            href="/display/calibrate"
            className="inline-block w-fit rounded bg-sky-500 px-5 py-3 text-base font-medium text-neutral-950 hover:bg-sky-400"
          >
            1. Calibrate this screen
          </Link>
        </li>
        <li>
          <Link
            href="/display/test"
            className="inline-block w-fit rounded bg-sky-500 px-5 py-3 text-base font-medium text-neutral-950 hover:bg-sky-400"
          >
            2. Two-device test
          </Link>
        </li>
      </ol>
      <div className="mt-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-600">
          Developer checks
        </p>
        <ul className="flex flex-col gap-1 text-sm text-neutral-500">
          <li>
            <Link href="/display/optotype" className="hover:text-neutral-300">
              /display/optotype
            </Link>
          </li>
          <li>
            <Link href="/display/range" className="hover:text-neutral-300">
              /display/range
            </Link>
          </li>
          <li>
            <Link href="/display/session" className="hover:text-neutral-300">
              /display/session
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
