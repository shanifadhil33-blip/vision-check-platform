import { describe, expect, it } from "vitest";
import { eyeCoverInstruction } from "./landoltWording";

describe("eyeCoverInstruction", () => {
  it("testing the right eye: cover the left", () => {
    expect(eyeCoverInstruction("right")).toBe("Cover your left eye.");
  });

  it("testing the left eye: cover the right", () => {
    expect(eyeCoverInstruction("left")).toBe("Cover your right eye.");
  });

  it("testing both eyes: keep both open", () => {
    expect(eyeCoverInstruction("both")).toBe("Keep both eyes open.");
  });
});
