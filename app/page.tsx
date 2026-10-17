import Link from "next/link";
import { CAL_ZOOM_HINT, HOME_NEEDS, HOME_START_TEST } from "@/lib/calibration/calibrateWording";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold text-neutral-100">Vision Check Platform</h1>
      <p className="text-sm text-neutral-500">{HOME_NEEDS}</p>
      <p className="text-sm text-neutral-500">{CAL_ZOOM_HINT}</p>
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
            {HOME_START_TEST}
          </Link>
        </li>
      </ol>
    </main>
  );
}
