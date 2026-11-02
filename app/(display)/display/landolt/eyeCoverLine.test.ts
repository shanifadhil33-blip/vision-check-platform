import { describe, expect, it } from "vitest";
import { eyeCoverLineFor } from "./eyeCoverLine";
import type { LandoltPhase } from "./landoltController";

describe("eyeCoverLineFor", () => {
  it("shows on the ready screen", () => {
    expect(eyeCoverLineFor({ phase: "ready", countdownValue: null, eye: "right" })).toBe(
      "Cover your left eye.",
    );
  });

  it.each([3, 2, 1])("shows under countdown number %i", (countdownValue) => {
    expect(eyeCoverLineFor({ phase: "countdown", countdownValue, eye: "left" })).toBe(
      "Cover your right eye.",
    );
  });

  it("does not show after the last number, while the setup check runs and the first C is prepared", () => {
    expect(eyeCoverLineFor({ phase: "countdown", countdownValue: null, eye: "right" })).toBeNull();
  });

  it.each<LandoltPhase>(["presenting", "awaiting_response"])(
    "does not show with a practice or scored C on screen (%s)",
    (phase) => {
      expect(eyeCoverLineFor({ phase, countdownValue: null, eye: "both" })).toBeNull();
    },
  );

  it.each<LandoltPhase>([
    "idle",
    "creating",
    "waiting_for_phone",
    "complete",
    "stopped",
    "error",
    "interrupted",
  ])("does not show in phase %s, including the result", (phase) => {
    expect(eyeCoverLineFor({ phase, countdownValue: null, eye: "right" })).toBeNull();
  });

  it("does not show without a chosen eye", () => {
    expect(eyeCoverLineFor({ phase: "ready", countdownValue: null, eye: null })).toBeNull();
    expect(eyeCoverLineFor({ phase: "countdown", countdownValue: 3, eye: null })).toBeNull();
  });
});
