/**
 * When the main screen shows the cover-eye line. Pure: no document, no network.
 * Only on the ready screen and while a countdown number is on screen. After the
 * last number the phase stays "countdown" with no number while the setup check
 * runs and the first C is prepared; that moment shows no line.
 */

import { eyeCoverInstruction, type LandoltEye } from "@/lib/acuity/landoltWording";
import type { LandoltSnapshot } from "./landoltController";

export function eyeCoverLineFor(
  snap: Pick<LandoltSnapshot, "phase" | "countdownValue"> & { eye: LandoltEye | null },
): string | null {
  if (snap.eye === null) {
    return null;
  }
  if (snap.phase === "ready") {
    return eyeCoverInstruction(snap.eye);
  }
  if (snap.phase === "countdown" && snap.countdownValue !== null) {
    return eyeCoverInstruction(snap.eye);
  }
  return null;
}
