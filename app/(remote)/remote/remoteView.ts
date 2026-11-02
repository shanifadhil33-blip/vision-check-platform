/**
 * What the phone shows for a loop state, as pure values: no document, no
 * network. remoteController applies these patches; the letter patches are
 * exactly the objects it built inline before the Landolt C build.
 */

import { PHONE_LOOK_AT_SCREEN } from "@/lib/acuity/autoStart";
import {
  DIRECTION_SENT_LABELS,
  PHONE_C_LOOK_AT_SCREEN,
  PHONE_C_PRACTICE_PROMPT,
  PHONE_C_PROMPT,
  PHONE_C_WAITING_FIRST,
  PHONE_C_WAITING_NEXT,
  PHONE_NOT_SURE,
} from "@/lib/acuity/landoltWording";
import type { SloanLetter } from "@/lib/acuity/sloan";
import type { AnyResponseChoice, ResponseChoice } from "@/lib/db/payloads";
import type { Json } from "@/lib/db/types";
import {
  isLandoltState,
  landoltRespondedState,
  respondedState,
  type AnyLoopState,
} from "@/lib/session/loopState";

export type PhoneTestMode = "letters" | "landolt";

export const LETTER_PROMPT = "Which letter do you see?";
export const LETTER_WAITING_FIRST = "Connected. Waiting for the first letter…";
export const LETTER_WAITING_NEXT = "Waiting for the next letter…";

export function testModeOf(state: AnyLoopState): PhoneTestMode {
  return isLandoltState(state) ? "landolt" : "letters";
}

type AwaitingState = Extract<AnyLoopState, { phase: "awaiting_response" }>;

/** The fields every choosing screen sets. Letters: the same object as before. */
export type ChoosingPatch = {
  phase: "choosing";
  choices: readonly SloanLetter[];
  presentationId: string;
  trialIndex: number;
  choiceLocked: false;
  errorMessage: null;
  everSawTrial: true;
  lastSentLabel: null;
  selectedChoice: null;
  positionFailed: false;
  practice?: boolean;
};

export function choosingPatch(state: AwaitingState): ChoosingPatch {
  const base = {
    phase: "choosing" as const,
    choices: "choices" in state ? state.choices : [],
    presentationId: state.presentationId,
    trialIndex: state.trialIndex,
    choiceLocked: false as const,
    errorMessage: null,
    everSawTrial: true as const,
    lastSentLabel: null,
    selectedChoice: null,
    positionFailed: false as const,
  };
  if ("practice" in state) {
    return { ...base, practice: state.practice };
  }
  return base;
}

export function phoneSentLabel(choice: AnyResponseChoice): string {
  if (choice.kind === "not_sure" || choice.kind === "direction_not_sure") {
    return PHONE_NOT_SURE;
  }
  if (choice.kind === "direction") {
    return DIRECTION_SENT_LABELS[choice.direction];
  }
  return choice.letter;
}

export function phoneWaitingLine(testMode: PhoneTestMode, everSawTrial: boolean): string {
  if (testMode === "landolt") {
    return everSawTrial ? PHONE_C_WAITING_NEXT : PHONE_C_WAITING_FIRST;
  }
  return everSawTrial ? LETTER_WAITING_NEXT : LETTER_WAITING_FIRST;
}

export function phoneLookAtScreen(testMode: PhoneTestMode): string {
  return testMode === "landolt" ? PHONE_C_LOOK_AT_SCREEN : PHONE_LOOK_AT_SCREEN;
}

export function phonePrompt(testMode: PhoneTestMode, practice: boolean): string {
  if (testMode === "landolt") {
    return practice ? PHONE_C_PRACTICE_PROMPT : PHONE_C_PROMPT;
  }
  return LETTER_PROMPT;
}

/**
 * The responded state to write for this answer, or null when the answer and
 * the state belong to different tests. A C answer is never written into a
 * letter state, and a letter answer never into a C state.
 */
export function respondedStateFor(
  state: AwaitingState,
  answered: { trialIndex: number; presentationId: string; responseId: string },
  choice: AnyResponseChoice,
): Json | null {
  const { trialIndex, presentationId, responseId } = answered;
  if (isLandoltState(state)) {
    if (choice.kind !== "direction" && choice.kind !== "direction_not_sure") {
      return null;
    }
    return landoltRespondedState({
      trialIndex,
      presentationId,
      responseId,
      responseKind: choice.kind === "direction" ? "direction" : "not_sure",
      responseDirection: choice.kind === "direction" ? choice.direction : null,
      run: state.run,
    });
  }
  if (choice.kind === "direction" || choice.kind === "direction_not_sure") {
    return null;
  }
  const letterChoice: ResponseChoice = choice;
  return respondedState({
    trialIndex,
    presentationId,
    responseId,
    responseKind: letterChoice.kind === "letter" ? "letter" : "not_sure",
    responseLetter: letterChoice.kind === "letter" ? letterChoice.letter : null,
    run: state.run,
  });
}
