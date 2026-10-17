import { describe, expect, it } from "vitest";
import {
  checkDistanceBeforeStart,
  DISTANCE_CONFIRM_LABEL,
  DISTANCE_HEADING,
  DISTANCE_INSTRUCTION,
  DISTANCE_PHONE_NOTE,
  MSG_DISTANCE_NOT_CONFIRMED,
  MSG_SCREEN_CANNOT_SHOW_AT_3M,
  MSG_SETUP_FAILED,
  storedDistanceMatches,
} from "./distanceSetup";

describe("checkDistanceBeforeStart", () => {
  it("D1 allows a confirmed 3000 mm and returns 3000", () => {
    expect(checkDistanceBeforeStart({ distanceMm: 3000, confirmed: true })).toEqual({
      ok: true,
      distanceMm: 3000,
    });
  });

  it("D2 refuses 3000 mm when the box is not ticked", () => {
    expect(checkDistanceBeforeStart({ distanceMm: 3000, confirmed: false })).toEqual({
      ok: false,
      reason: "not-confirmed",
    });
  });

  it("D3 refuses a confirmed 2000 mm as not allowed", () => {
    expect(checkDistanceBeforeStart({ distanceMm: 2000, confirmed: true })).toEqual({
      ok: false,
      reason: "not-allowed",
    });
  });

  it("D4 refuses 1 mm either side of 3000 mm", () => {
    expect(checkDistanceBeforeStart({ distanceMm: 2999, confirmed: true })).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    expect(checkDistanceBeforeStart({ distanceMm: 3001, confirmed: true })).toEqual({
      ok: false,
      reason: "not-allowed",
    });
  });

  it("D5 refuses NaN, zero, negative and infinite distances", () => {
    for (const distanceMm of [Number.NaN, 0, -3000, Number.POSITIVE_INFINITY]) {
      expect(checkDistanceBeforeStart({ distanceMm, confirmed: true })).toEqual({
        ok: false,
        reason: "not-allowed",
      });
    }
  });

  it("D6 reports not-confirmed before not-allowed", () => {
    expect(checkDistanceBeforeStart({ distanceMm: 2000, confirmed: false })).toEqual({
      ok: false,
      reason: "not-confirmed",
    });
  });
});

describe("storedDistanceMatches", () => {
  it("M1 matches when the stored distance equals the confirmed one", () => {
    expect(storedDistanceMatches(3000, 3000)).toBe(true);
  });

  it("M2 does not match 1 mm either side", () => {
    expect(storedDistanceMatches(3000, 2999)).toBe(false);
    expect(storedDistanceMatches(3000, 3001)).toBe(false);
  });

  it("M3 does not match a missing or NaN stored distance", () => {
    expect(storedDistanceMatches(3000, null)).toBe(false);
    expect(storedDistanceMatches(3000, Number.NaN)).toBe(false);
  });
});

describe("distance step wording", () => {
  it("W1 heading", () => {
    expect(DISTANCE_HEADING).toBe("Set up your test position");
  });

  it("W2 instruction", () => {
    expect(DISTANCE_INSTRUCTION).toBe(
      "Measure 3 metres from where your eyes will be to this computer screen, and mark that spot on the floor.",
    );
  });

  it("W3 phone note", () => {
    expect(DISTANCE_PHONE_NOTE).toBe(
      "Your phone stays with you at that spot. You’ll use it to answer.",
    );
  });

  it("W4 confirm label", () => {
    expect(DISTANCE_CONFIRM_LABEL).toBe("I’ve measured and marked 3 metres from the screen");
  });

  it("W5 not confirmed message", () => {
    expect(MSG_DISTANCE_NOT_CONFIRMED).toBe(
      "Tick the box to confirm you’ve marked 3 metres from the screen, then press Start.",
    );
  });

  it("W6 screen cannot show at 3 m message", () => {
    expect(MSG_SCREEN_CANNOT_SHOW_AT_3M).toBe(
      "This screen can’t show the test letters at 3 metres. Make the browser window full size, then press Start again. If it’s already full size, use a larger screen.",
    );
  });

  it("W7 setup failed message", () => {
    expect(MSG_SETUP_FAILED).toBe("The test couldn’t be set up. Refresh the page and try again.");
  });
});
