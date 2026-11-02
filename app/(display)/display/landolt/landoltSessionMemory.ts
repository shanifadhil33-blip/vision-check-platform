/**
 * Tab-scoped memory of the session the Landolt C page has open, so a session
 * left open by leaving the page is closed the next time the page opens in the
 * same tab. Copy of test/openSessionMemory.ts with its own key, so the C page
 * and the letter page never close each other's sessions. Storage that is
 * missing or throws behaves as empty.
 */

export const LANDOLT_OPEN_SESSION_KEY = "vcp.openSession.landolt.v1";

const SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function rememberOpenSession(id: string): void {
  try {
    sessionStorage.setItem(LANDOLT_OPEN_SESSION_KEY, id);
  } catch {
    // Storage unavailable: nothing is remembered.
  }
}

/** With an id, clears only when the stored id matches. Without one, always clears. */
export function forgetOpenSession(id?: string): void {
  try {
    if (id !== undefined && sessionStorage.getItem(LANDOLT_OPEN_SESSION_KEY) !== id) {
      return;
    }
    sessionStorage.removeItem(LANDOLT_OPEN_SESSION_KEY);
  } catch {
    // Storage unavailable: nothing to forget.
  }
}

export function readOpenSession(): string | null {
  try {
    const stored = sessionStorage.getItem(LANDOLT_OPEN_SESSION_KEY);
    if (stored === null || !SESSION_UUID_RE.test(stored)) {
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export function isSessionUuid(value: string): boolean {
  return SESSION_UUID_RE.test(value);
}
