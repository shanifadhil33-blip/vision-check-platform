import { describe, expect, it } from "vitest";
import {
  NOMINAL_CSS_PX_PER_MM,
  buildResultsText,
  requestedDevicePx,
  signedDifference,
  smallestSizeLine,
  withinOnePixel,
  type ResultsTextInput,
} from "./drawCheck";

const VIEW_1920_1080 = {
  devicePixelRatio: 1,
  viewportWidthCssPx: 1920,
  viewportHeightCssPx: 1080,
};

function resultsInput(overrides: Partial<ResultsTextInput>): ResultsTextInput {
  return {
    dateIso: "2026-10-09",
    userAgent: "TestBrowser/1.0",
    devicePixelRatio: 1,
    innerWidthCssPx: 1920,
    innerHeightCssPx: 1080,
    screenWidthCssPx: 1920,
    screenHeightCssPx: 1080,
    zoom: { state: "default", ratio: 1.004 },
    screenSetUp: true,
    cssPxPerMm: 1 / 0.311,
    rows: [],
    ...overrides,
  };
}

describe("requestedDevicePx", () => {
  it("DC1 is the unrounded product at step 10, 2 m, 4.1473 CSS px per mm, dpr 1.5", () => {
    expect(requestedDevicePx(10, 2000, 4.1473, 1.5).toFixed(2)).toBe("180.96");
  });

  it("DC2 is the unrounded product at step 0 with the nominal CSS px per mm and dpr 1", () => {
    expect(requestedDevicePx(0, 2000, NOMINAL_CSS_PX_PER_MM, 1).toFixed(2)).toBe("10.99");
  });
});

describe("withinOnePixel", () => {
  it("DC3 accepts a drawn size 1.00 device pixel above the request", () => {
    expect(withinOnePixel(180.0, 181)).toBe(true);
  });

  it("DC4 rejects 180.96 versus 182, a difference of 1.04", () => {
    expect(withinOnePixel(180.96, 182)).toBe(false);
  });

  it("DC5 accepts 180.96 versus 180, a difference of -0.96", () => {
    expect(withinOnePixel(180.96, 180)).toBe(true);
  });

  it("DC6 rejects 179.99 versus 181, a difference of 1.01", () => {
    expect(withinOnePixel(179.99, 181)).toBe(false);
  });

  it("DC7 accepts a drawn size exactly 1 device pixel below the request", () => {
    expect(withinOnePixel(181, 180)).toBe(true);
  });
});

describe("signedDifference", () => {
  it("DC8 writes a positive hundredth with a plus sign", () => {
    expect(signedDifference(0.04)).toBe("+0.04");
  });

  it("DC9 writes a negative hundredth with a minus sign", () => {
    expect(signedDifference(-0.96)).toBe("-0.96");
  });

  it("DC10 rounds -0.001 to zero and still writes a plus sign", () => {
    expect(signedDifference(-0.001)).toBe("+0.00");
  });

  it("DC11 names Math.round(1.005 * 100) / 100 as 1, because 1.005 * 100 is 100.49999999999999, so the text is +1.00", () => {
    expect(Math.round(1.005 * 100) / 100).toBe(1);
    expect(signedDifference(1.005)).toBe("+1.00");
  });
});

describe("smallestSizeLine", () => {
  it("DC12 at 2 m with css px per mm 1/0.311 is 6/6 limited by screen sharpness", () => {
    expect(
      smallestSizeLine({
        ...VIEW_1920_1080,
        distanceMm: 2000,
        cssPxPerMm: 1 / 0.311,
      }),
    ).toBe("6/6 (limited by the screen's sharpness)");
  });

  it("DC13 at 3 m with css px per mm 1/0.311 is 6/5 because the test stops there", () => {
    expect(
      smallestSizeLine({
        ...VIEW_1920_1080,
        distanceMm: 3000,
        cssPxPerMm: 1 / 0.311,
      }),
    ).toBe("6/5 (the test stops here)");
  });

  it("DC14 at 2 m with css px per mm 1/0.2772 is 6/5 because the test stops there", () => {
    expect(
      smallestSizeLine({
        ...VIEW_1920_1080,
        distanceMm: 2000,
        cssPxPerMm: 1 / 0.2772,
      }),
    ).toBe("6/5 (the test stops here)");
  });

  it("DC15 at 2 m with css px per mm 1/0.2774 is 6/6 limited by screen sharpness", () => {
    expect(
      smallestSizeLine({
        ...VIEW_1920_1080,
        distanceMm: 2000,
        cssPxPerMm: 1 / 0.2774,
      }),
    ).toBe("6/6 (limited by the screen's sharpness)");
  });

  it("DC16 returns none when the 1920-class pitch cannot fit any triplet in a 100 by 100 window", () => {
    expect(
      smallestSizeLine({
        distanceMm: 2000,
        cssPxPerMm: 1 / 0.311,
        devicePixelRatio: 1,
        viewportWidthCssPx: 100,
        viewportHeightCssPx: 100,
      }),
    ).toBe("none");
  });
});

describe("buildResultsText", () => {
  const twoRows = [
    {
      stepIndex: 0,
      askedForDevicePx: 50.5,
      drawnDevicePx: 52,
      layoutDevicePx: 40,
      canvasHeightDevicePx: 40,
    },
    {
      stepIndex: 10,
      askedForDevicePx: 100,
      drawnDevicePx: 101,
      layoutDevicePx: 100.5,
      canvasHeightDevicePx: 101,
    },
  ];

  it("DC17 matches the whole block for two rows, normal zoom, and a set-up screen", () => {
    const text = buildResultsText(
      resultsInput({
        rows: twoRows,
      }),
    );
    expect(text).toBe(
      [
        "Screen drawing check (m5-check-1)",
        "Date: 2026-10-09",
        "Browser: TestBrowser/1.0",
        "Screen pixel ratio: 1",
        "Window: 1920 x 1080",
        "Screen: 1920 x 1080",
        "Zoom: normal (ratio 1.004)",
        "Screen set up: yes, 3.2154 CSS px per mm",
        "Smallest size at 2 m: 6/6 (limited by the screen's sharpness)",
        "Smallest size at 3 m: 6/5 (the test stops here)",
        "Letters at 2 m (size, asked for, drawn, difference, within one pixel, layout, canvas pixels):",
        "6/60, 100.00, 101, +1.00, yes, 100.50, 101",
        "6/6, 50.50, 52, +1.50, no, 40.00, 40",
        "Result: 1 of 2 sizes within one screen pixel",
      ].join("\n"),
    );
    expect(text.endsWith("\n")).toBe(false);
  });

  it("DC18 replaces the result line when zoom is not at 100 percent", () => {
    const text = buildResultsText(
      resultsInput({
        zoom: { state: "not-default", ratio: 1.25 },
        rows: twoRows,
      }),
    );
    expect(text).toContain("Zoom: not 100% (ratio 1.250)");
    expect(text.endsWith("Result: not counted, browser zoom isn't at 100%")).toBe(true);
  });

  it("DC19 says the screen is not set up and both smallest sizes are not available", () => {
    const text = buildResultsText(
      resultsInput({
        screenSetUp: false,
        cssPxPerMm: NOMINAL_CSS_PX_PER_MM,
        rows: twoRows.slice(0, 1),
      }),
    );
    const lines = text.split("\n");
    expect(lines).toContain("Screen set up: no, standard size used");
    expect(lines).toContain("Smallest size at 2 m: not available, screen not set up");
    expect(lines).toContain("Smallest size at 3 m: not available, screen not set up");
  });

  it("DC20 reports that no test sizes fit when there are no rows and zoom is normal", () => {
    const text = buildResultsText(resultsInput({ rows: [] }));
    const lines = text.split("\n");
    const header =
      "Letters at 2 m (size, asked for, drawn, difference, within one pixel, layout, canvas pixels):";
    const headerIndex = lines.indexOf(header);
    expect(headerIndex).toBeGreaterThan(-1);
    expect(lines[headerIndex + 1]).toBe("Result: no test sizes fit this window");
    expect(text.endsWith("\n")).toBe(false);
  });

  it("DC21 counts the rows when zoom could not be told and prints ratio n/a", () => {
    const text = buildResultsText(
      resultsInput({
        zoom: { state: "unknown", ratio: Number.NaN },
        rows: twoRows.slice(1),
      }),
    );
    expect(text).toContain("Zoom: could not tell (ratio n/a)");
    expect(text.endsWith("Result: 1 of 1 sizes within one screen pixel")).toBe(true);
    expect(text).not.toContain("not counted");
  });
});
