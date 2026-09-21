"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** CSS-pixel inset added on every side of the card outline. */
export const CARD_ZONE_MARGIN_CSS_PX = 48;

type CardZoneProps = {
  children: ReactNode;
};

/**
 * Non-interactive shell around the card outline: outline size plus
 * CARD_ZONE_MARGIN_CSS_PX on every side. Blocks scroll / pinch / activation
 * from resting fingers via touch-action and non-passive preventDefault.
 */
export function CardZone({ children }: CardZoneProps) {
  const zoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = zoneRef.current;
    if (element === null) {
      return;
    }

    function blockTouch(event: TouchEvent): void {
      event.preventDefault();
    }

    element.addEventListener("touchstart", blockTouch, { passive: false });
    element.addEventListener("touchmove", blockTouch, { passive: false });

    return () => {
      element.removeEventListener("touchstart", blockTouch);
      element.removeEventListener("touchmove", blockTouch);
    };
  }, []);

  return (
    <div
      ref={zoneRef}
      style={{
        touchAction: "none",
        padding: CARD_ZONE_MARGIN_CSS_PX,
        boxSizing: "content-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}
