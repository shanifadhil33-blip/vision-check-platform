import { describe, expect, it } from "vitest";
import { letterHeightMmForLogMar } from "@/lib/acuity/logmar";
import { mmToCssPx } from "@/lib/calibration";
import { letterLayout, markerSlot } from "./markerSlot";

/** 1280 x 585 CSS window, 4.176 CSS px per mm, DPR 1.5. */
const WINDOW = { viewportWidthCssPx: 1280, viewportHeightCssPx: 585, cssPxPerMm: 4.176, devicePixelRatio: 1.5 };

function letterCssPx(stepIndex: number, distanceMm: number): number {
  return mmToCssPx(letterHeightMmForLogMar(stepIndex / 10, distanceMm), WINDOW.cssPxPerMm);
}

describe("marker slot", () => {
  it("100 mm asked: cell 78 device px, side 624 device px = 416 CSS px = 99.6 mm", () => {
    const slot = markerSlot(WINDOW);
    // 100 x 4.176 x 1.5 = 626.4 device px; / 8 = 78.3, rounded to 78.
    expect(slot.cellDevicePx).toBe(78);
    expect(slot.sideDevicePx).toBe(624);
    expect(slot.sideCssPx).toBe(416);
    expect(slot.drawnSideMm).toBeCloseTo(99.617, 3);
    expect(slot.quietZoneDevicePx).toBe(78);
  });

  it("sits 24 CSS px in from the right edge, vertically centred, on whole device pixels", () => {
    const slot = markerSlot(WINDOW);
    // 1920 - 36 - 624 = 1260 device px; (877 - 624) / 2 = 126.5, rounded to 127.
    expect(slot.leftDevicePx).toBe(1260);
    expect(slot.leftCssPx).toBe(840);
    expect(slot.topDevicePx).toBe(127);
    expect(slot.leftCssPx + slot.sideCssPx + 24).toBe(1280);
    // Content area = 1280 - (416 + 48).
    expect(slot.contentWidthCssPx).toBe(816);
  });
});

describe("letter beside the marker or between letters", () => {
  const slot = markerSlot(WINDOW);

  it("3 m, 6/48: side by side", () => {
    // L = 34.659 mm = 144.74 CSS px; 5L + 48 = 771.7 <= 816; max(416, 224.7) + 48 = 464 <= 585.
    expect(letterLayout({ slot, viewportHeightCssPx: 585, letterHeightCssPx: letterCssPx(9, 3000) })).toBe(
      "side-by-side",
    );
  });

  it("3 m, 6/60: between letters", () => {
    // L = 43.634 mm = 182.21 CSS px; 5L + 48 = 959.1 > 816.
    expect(letterLayout({ slot, viewportHeightCssPx: 585, letterHeightCssPx: letterCssPx(10, 3000) })).toBe(
      "between-letters",
    );
  });

  it("2 m, 6/60: side by side", () => {
    // L = 29.089 mm = 121.48 CSS px; 5L + 48 = 655.4 <= 816.
    expect(letterLayout({ slot, viewportHeightCssPx: 585, letterHeightCssPx: letterCssPx(10, 2000) })).toBe(
      "side-by-side",
    );
  });

  it("a window too short for the marker plus 48 px is between letters", () => {
    expect(letterLayout({ slot, viewportHeightCssPx: 463, letterHeightCssPx: 20 })).toBe("between-letters");
    expect(letterLayout({ slot, viewportHeightCssPx: 464, letterHeightCssPx: 20 })).toBe("side-by-side");
  });
});
