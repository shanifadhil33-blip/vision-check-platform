/**
 * Movement detection wording, staff only for now. Pure strings; the distance
 * comes from the existing wording helper so 3 metres or 2 metres follows the
 * chosen distance.
 */

import { metresText } from "@/lib/acuity/distanceSetup";

export const PHONE_HOLD_INSTRUCTION =
  "When you’re there, hold your phone at chest height with its back camera facing the screen.";
export const PHONE_CAMERA_NOTICE =
  "Your phone will ask to use its camera. It only measures the square on the screen, and no pictures are saved.";
export const PHONE_STATUS_LOST = "Point the back camera at the screen.";
export const PHONE_STATUS_GO_BACK = "Please go back to your mark.";
export const PHONE_CAMERA_UNAVAILABLE =
  "The camera isn’t available, so the test will carry on without it.";
export const PHONE_CAMERA_RESTART_BUTTON = "Turn the camera back on";

export const MAIN_WAITING_FOR_CAMERA = "Hold your phone up so its back camera can see this screen.";
export const MAIN_PAUSE_MOVED_TITLE = "Please go back to your mark";
export function mainPauseMovedBody(distanceMm: number): string {
  return `Stand ${metresText(distanceMm)} from this screen and hold your phone up with its back camera facing the screen. The test will carry on by itself.`;
}
export const MAIN_PAUSE_LOST_TITLE = "Your phone can’t see the screen";
export const MAIN_PAUSE_LOST_BODY =
  "Hold your phone up at chest height with its back camera facing the screen. The test will carry on by itself.";
