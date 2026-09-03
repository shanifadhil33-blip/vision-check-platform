import { CalibrateFlow } from "./CalibrateFlow";

export default function CalibratePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-8 px-6 py-12">
      <header className="w-full max-w-3xl text-left">
        <h1 className="text-2xl font-semibold text-neutral-100">Screen calibration</h1>
        <p className="mt-2 text-neutral-400">
          Every physical size in this application comes from this step. Match a bank card to the
          outline, then check the result with a ruler.
        </p>
      </header>
      <CalibrateFlow />
    </main>
  );
}
