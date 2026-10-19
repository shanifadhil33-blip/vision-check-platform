import { describe, expect, it } from "vitest";
import {
  checkDistanceBeforeStart,
  distanceConfirmLabel,
  DISTANCE_HEADING,
  distanceInstruction,
  DISTANCE_PHONE_NOTE,
  metresText,
  msgDistanceNotConfirmed,
  msgScreenCannotShow,
  MSG_SETUP_FAILED,
  SMALL_ROOM_LINK,
  storedDistanceMatches,
  TWO_M_NOTE,
  USE_3M_LINK,
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

  it("D3 allows a confirmed 2000 mm and returns 2000", () => {
    expect(checkDistanceBeforeStart({ distanceMm: 2000, confirmed: true })).toEqual({
      ok: true,
      distanceMm: 2000,
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
    expect(checkDistanceBeforeStart({ distanceMm: 2500, confirmed: false })).toEqual({
      ok: false,
      reason: "not-confirmed",
    });
  });

  it("D7 refuses 1 mm either side of 2000 mm", () => {
    expect(checkDistanceBeforeStart({ distanceMm: 1999, confirmed: true })).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    expect(checkDistanceBeforeStart({ distanceMm: 2001, confirmed: true })).toEqual({
      ok: false,
      reason: "not-allowed",
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

  it("W2 instruction at 3000 mm", () => {
    expect(distanceInstruction(3000)).toBe(
      "Measure 3 metres from where your eyes will be to this computer screen, and mark that spot on the floor.",
    );
  });

  it("W2b instruction at 2000 mm", () => {
    expect(distanceInstruction(2000)).toBe(
      "Measure 2 metres from where your eyes will be to this computer screen, and mark that spot on the floor.",
    );
  });

  it("W3 phone note", () => {
    expect(DISTANCE_PHONE_NOTE).toBe(
      "Your phone stays with you at that spot. You’ll use it to answer.",
    );
  });

  it("W4 confirm label at 3000 mm", () => {
    expect(distanceConfirmLabel(3000)).toBe("I’ve measured and marked 3 metres from the screen");
  });

  it("W4b confirm label at 2000 mm", () => {
    expect(distanceConfirmLabel(2000)).toBe("I’ve measured and marked 2 metres from the screen");
  });

  it("W5 not confirmed message at 3000 mm", () => {
    expect(msgDistanceNotConfirmed(3000)).toBe(
      "Tick the box to confirm you’ve marked 3 metres from the screen, then press Start.",
    );
  });

  it("W5b not confirmed message at 2000 mm", () => {
    expect(msgDistanceNotConfirmed(2000)).toBe(
      "Tick the box to confirm you’ve marked 2 metres from the screen, then press Start.",
    );
  });

  it("W6 screen cannot show message at 3000 mm", () => {
    expect(msgScreenCannotShow(3000)).toBe(
      "This screen can’t show the test letters at 3 metres. Make the browser window full size, then press Start again. If it’s already full size, use a larger screen.",
    );
  });

  it("W6b screen cannot show message at 2000 mm", () => {
    expect(msgScreenCannotShow(2000)).toBe(
      "This screen can’t show the test letters at 2 metres. Make the browser window full size, then press Start again. If it’s already full size, use a larger screen.",
    );
  });

  it("W7 setup failed message", () => {
    expect(MSG_SETUP_FAILED).toBe("The test couldn’t be set up. Refresh the page and try again.");
  });

  it("W8 metresText for 3000 and 2000 mm", () => {
    expect(metresText(3000)).toBe("3 metres");
    expect(metresText(2000)).toBe("2 metres");
  });

  it("W9 small room link", () => {
    expect(SMALL_ROOM_LINK).toBe("I don’t have 3 metres of space");
  });

  it("W10 use 3 metres link", () => {
    expect(USE_3M_LINK).toBe("Use 3 metres instead");
  });

  it("W11 two metre note", () => {
    expect(TWO_M_NOTE).toBe("3 metres is recommended. Use 2 metres only if your room is too small.");
  });
});
