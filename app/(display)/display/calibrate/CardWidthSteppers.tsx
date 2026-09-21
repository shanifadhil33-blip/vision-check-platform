"use client";

type StepPair = "narrower" | "wider";

type CardWidthSteppersProps = {
  pair: StepPair;
  minCssPx: number;
  maxCssPx: number;
  valueCssPx: number;
  onStep: (deltaCssPx: number) => void;
};

const NARROWER_BUTTONS: ReadonlyArray<{
  deltaCssPx: number;
  visibleLabel: string;
  accessibleName: string;
}> = [
  {
    deltaCssPx: -10,
    visibleLabel: "−10",
    accessibleName: "Make outline 10 pixels narrower",
  },
  {
    deltaCssPx: -1,
    visibleLabel: "−1",
    accessibleName: "Make outline 1 pixel narrower",
  },
];

const WIDER_BUTTONS: ReadonlyArray<{
  deltaCssPx: number;
  visibleLabel: string;
  accessibleName: string;
}> = [
  {
    deltaCssPx: 1,
    visibleLabel: "+1",
    accessibleName: "Make outline 1 pixel wider",
  },
  {
    deltaCssPx: 10,
    visibleLabel: "+10",
    accessibleName: "Make outline 10 pixels wider",
  },
];

/**
 * Touch-friendly one-shot width steps. Share min/max with the range slider
 * via the same props from the parent. Render one pair at a time so the
 * parent can place the slider between them.
 */
export function CardWidthSteppers({
  pair,
  minCssPx,
  maxCssPx,
  valueCssPx,
  onStep,
}: CardWidthSteppersProps) {
  const buttons = pair === "narrower" ? NARROWER_BUTTONS : WIDER_BUTTONS;
  const groupLabel =
    pair === "narrower" ? "Outline width narrower steps" : "Outline width wider steps";

  return (
    <div className="flex shrink-0 items-center gap-2" role="group" aria-label={groupLabel}>
      {buttons.map((button) => {
        const disabled =
          (button.deltaCssPx < 0 && valueCssPx <= minCssPx) ||
          (button.deltaCssPx > 0 && valueCssPx >= maxCssPx);
        return (
          <button
            key={button.deltaCssPx}
            type="button"
            aria-label={button.accessibleName}
            disabled={disabled}
            onClick={() => onStep(button.deltaCssPx)}
            className="min-h-12 min-w-12 rounded border border-neutral-600 px-3 py-2 text-base font-medium text-neutral-100 hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {button.visibleLabel}
          </button>
        );
      })}
    </div>
  );
}
