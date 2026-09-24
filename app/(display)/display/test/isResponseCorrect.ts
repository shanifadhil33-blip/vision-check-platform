import type { SloanLetter } from "@/lib/acuity/sloan";

/**
 * Correct when the response is a letter that matches the target.
 * not_sure and wrong letters are incorrect. Behaviour must stay identical
 * for the live advance path and the post-reload rebuild path.
 */
export function isResponseCorrect(
  responseKind: "letter" | "not_sure",
  responseLetter: SloanLetter | null,
  target: SloanLetter,
): boolean {
  return responseKind === "letter" && responseLetter === target;
}
