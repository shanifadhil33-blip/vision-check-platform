/**
 * The staff switch. Pure: takes the address's query string, returns whether
 * movement detection runs. The only lib/movement code that runs when the
 * switch is off.
 */

import { MOVEMENT_DEFAULT_ON } from "./params";

export const MOVEMENT_QUERY_KEY = "movement";

export function movementSwitchOn(search: string): boolean {
  return MOVEMENT_DEFAULT_ON || new URLSearchParams(search).get(MOVEMENT_QUERY_KEY) === "1";
}
