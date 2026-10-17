import type { Metadata } from "next";
import { CAL_INTRO, CAL_PAGE_TITLE, CAL_ZOOM_HINT } from "@/lib/calibration/calibrateWording";
import { CalibrateFlow } from "./CalibrateFlow";

export const metadata: Metadata = {
  title: CAL_PAGE_TITLE,
};

export default async function CalibratePage({
  searchParams,
}: {
  searchParams: Promise<{ diag?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.diag;
  const showDiagnostics = raw === "1";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-8 px-6 py-12">
      <header className="w-full max-w-3xl text-left">
        <h1 className="text-2xl font-semibold text-neutral-100">Screen calibration</h1>
        <p className="mt-2 text-neutral-400">{CAL_INTRO}</p>
        <p className="mt-3 text-sm text-neutral-500">{CAL_ZOOM_HINT}</p>
      </header>
      <CalibrateFlow showDiagnostics={showDiagnostics} />
    </main>
  );
}
