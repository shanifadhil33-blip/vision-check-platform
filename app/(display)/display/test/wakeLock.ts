/**
 * Keeps the main screen awake during a test. Unsupported browsers and refused
 * requests are ignored. No React. Owned by testController.
 */

let wanted = false;
let listening = false;
let requestInFlight = false;
let sentinel: WakeLockSentinel | null = null;

function onVisibilityChange(): void {
  if (wanted && document.visibilityState === "visible") {
    void acquire();
  }
}

async function acquire(): Promise<void> {
  if (sentinel !== null || requestInFlight) {
    return;
  }
  requestInFlight = true;
  try {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }
    const next = await navigator.wakeLock.request("screen");
    if (!wanted) {
      await next.release();
      return;
    }
    sentinel = next;
    next.addEventListener("release", () => {
      if (sentinel === next) {
        sentinel = null;
      }
    });
  } catch {
    // Refused: tab hidden, permissions policy or power saving.
  } finally {
    requestInFlight = false;
  }
}

export function requestScreenAwake(): void {
  try {
    wanted = true;
    if (!listening && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
      listening = true;
    }
    void acquire();
  } catch (error) {
    console.error(error);
  }
}

export function releaseScreenAwake(): void {
  try {
    wanted = false;
    if (listening) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      listening = false;
    }
    const current = sentinel;
    sentinel = null;
    if (current !== null) {
      current.release().catch((error: unknown) => {
        console.error(error);
      });
    }
  } catch (error) {
    console.error(error);
  }
}
