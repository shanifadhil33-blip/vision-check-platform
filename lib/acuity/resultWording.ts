/**
 * Customer-facing result sentences. Display text only.
 * Optotype size always comes from the step index, never from these strings.
 */

import type { RunContext, RunResult } from "@/lib/session/loopState";
import { customerLabelForStep } from "./resultLabel";

export const WEARING_QUESTION = "What will you be wearing during this test?";

export const CORRECTION_OPTIONS: Readonly<Record<RunContext["correction"], string>> = {
  none: "No glasses or contact lenses",
  contacts: "My contact lenses",
  glasses: "My glasses",
};

export const CORRECTION_PHRASE: Readonly<Record<RunContext["correction"], string>> = {
  none: "without glasses or contact lenses",
  contacts: "wearing your contact lenses",
  glasses: "wearing your glasses",
};

export const DISTANCE_ONLY_NOTICE =
  "This checks distance vision only and does not replace an eye examination.";

export const SAFETY_NOTICE =
  "If your vision has suddenly worsened, or you have severe eye pain, seek urgent medical attention rather than relying on this test.";

export function resultSentence(
  result: RunResult,
  correction: RunContext["correction"],
): string {
  const phrase = CORRECTION_PHRASE[correction];

  if (result.kind === "not-measurable") {
    return "We could not obtain a result because you could not identify the largest letters at the test distance. Check your setup and try again. If you still cannot read them, arrange an eye examination promptly.";
  }

  if (result.kind === "test-floor") {
    return `Your estimated distance vision with both eyes together, ${phrase}, is 6/5 or better. This is a good level of distance vision. Continue your regular eye examinations.`;
  }

  if (result.kind === "screen-limited") {
    const label = customerLabelForStep(result.stepIndex);
    return `${label} or better. You reached the smallest letters this screen can display reliably, so we could not measure whether your vision is finer than this. Continue your regular eye examinations.`;
  }

  if (result.stepIndex === 0) {
    return `Your estimated distance vision with both eyes together, ${phrase}, is approximately 6/6. This is a good level of distance vision. Continue your regular eye examinations.`;
  }

  const label = customerLabelForStep(result.stepIndex);
  return `Your estimated distance vision with both eyes together, ${phrase}, is approximately ${label}. You could not read the smaller letters needed for a 6/6 result. We recommend an eye examination to check your vision and prescription.`;
}
