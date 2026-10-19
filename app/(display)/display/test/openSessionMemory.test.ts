import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetOpenSession, readOpenSession, rememberOpenSession } from "./openSessionMemory";

const SESSION_A = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const SESSION_B = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function throwingStorage(): Storage {
  const fail = (): never => {
    throw new Error("storage unavailable");
  };
  return {
    get length(): number {
      return fail();
    },
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

describe("open session memory", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("O1 remember, then read, gives the id", () => {
    rememberOpenSession(SESSION_A);
    expect(readOpenSession()).toBe(SESSION_A);
  });

  it("O2 forget with the same id clears", () => {
    rememberOpenSession(SESSION_A);
    forgetOpenSession(SESSION_A);
    expect(readOpenSession()).toBeNull();
  });

  it("O3 forget with a different id keeps", () => {
    rememberOpenSession(SESSION_A);
    forgetOpenSession(SESSION_B);
    expect(readOpenSession()).toBe(SESSION_A);
  });

  it("O4 a non-UUID stored value reads as null", () => {
    rememberOpenSession("not-a-session");
    expect(readOpenSession()).toBeNull();
  });

  it("O5 storage that throws reads as null, and remember does not throw", () => {
    vi.stubGlobal("sessionStorage", throwingStorage());
    expect(() => {
      rememberOpenSession(SESSION_A);
    }).not.toThrow();
    expect(() => {
      forgetOpenSession(SESSION_A);
    }).not.toThrow();
    expect(readOpenSession()).toBeNull();
  });

  it("O6 forget with no id always clears", () => {
    rememberOpenSession(SESSION_A);
    forgetOpenSession();
    expect(readOpenSession()).toBeNull();
  });
});
