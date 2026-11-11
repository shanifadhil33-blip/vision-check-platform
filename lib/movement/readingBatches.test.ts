import { describe, expect, it } from "vitest";
import { sendReadingBatches } from "./readingBatches";

const READINGS = Array.from({ length: 120 }, (_, i) => i);

describe("distance reading batches", () => {
  it("120 readings go in calls of 50, 50 and 20, in order", async () => {
    const calls: number[][] = [];
    const result = await sendReadingBatches(
      READINGS,
      async (batch) => {
        calls.push(batch);
        return { ok: true };
      },
      () => {
        throw new Error("no failure expected");
      },
    );
    expect(calls.map((batch) => batch.length)).toEqual([50, 50, 20]);
    expect(calls.flat()).toEqual(READINGS);
    expect(result).toEqual({ sent: 120, dropped: 0 });
  });

  it("a failed call is reported once and dropped; the others still go; nothing throws", async () => {
    const failures: [string, number][] = [];
    const calls: number[] = [];
    const result = await sendReadingBatches(
      READINGS,
      async (batch) => {
        calls.push(batch.length);
        return calls.length === 2 ? { ok: false, message: "V0008 closed" } : { ok: true };
      },
      (message, count) => failures.push([message, count]),
    );
    expect(calls).toEqual([50, 50, 20]);
    expect(failures).toEqual([["V0008 closed", 50]]);
    expect(result).toEqual({ sent: 70, dropped: 50 });
  });

  it("a call that throws, and a reporter that throws, still do not throw", async () => {
    const failures: string[] = [];
    await expect(
      sendReadingBatches(
        [1, 2, 3],
        async () => {
          throw new Error("network down");
        },
        (message) => {
          failures.push(message);
          throw new Error("reporter down");
        },
      ),
    ).resolves.toEqual({ sent: 0, dropped: 3 });
    expect(failures).toEqual(["network down"]);
  });
});
