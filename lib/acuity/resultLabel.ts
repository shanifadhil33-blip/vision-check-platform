/**
 * Customer-facing Snellen labels. The label is display text only.
 * Optotype size always comes from the step index, never from the label.
 */

import { COARSEST_TESTED_STEP_INDEX, FINEST_TESTED_STEP_INDEX } from "./testLevels";

export const CUSTOMER_LABELS: Readonly<Record<number, string>> = {
  [-1]: "6/5",
  0: "6/6",
  1: "6/7.5",
  2: "6/9",
  3: "6/12",
  4: "6/15",
  5: "6/18",
  6: "6/24",
  7: "6/30",
  8: "6/36",
  9: "6/48",
  10: "6/60",
};

export function customerLabelForStep(stepIndex: number): string {
  if (
    !Number.isInteger(stepIndex) ||
    stepIndex < FINEST_TESTED_STEP_INDEX ||
    stepIndex > COARSEST_TESTED_STEP_INDEX
  ) {
    throw new RangeError("step index must be an integer from -1 to 10");
  }
  const label = CUSTOMER_LABELS[stepIndex];
  if (label === undefined) {
    throw new RangeError("step index must be an integer from -1 to 10");
  }
  return label;
}
