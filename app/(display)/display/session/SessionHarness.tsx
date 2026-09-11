"use client";

import Link from "next/link";
import { useState } from "react";
import {
  letterHeightMmForLogMar,
  strokeWidthMmForLogMar,
} from "@/lib/acuity";
import type { VcpError } from "@/lib/db/errors";
import type { PresentationPayload } from "@/lib/db/payloads";
import {
  getSession,
  pairSession,
  submitResponse as rpcSubmitResponse,
} from "@/lib/db/rpc";
import { newClientRequestId } from "@/lib/session/clientRequestId";
import {
  attachCalibration,
  createSession,
  getSnapshot,
  loadSession,
  pair,
  recordPresentation,
  setState,
  submitResponse,
} from "@/lib/session/sessionStore";
import { useSessionStore } from "@/lib/session/useSessionStore";
import { useCalibration } from "../calibrate/useCalibration";

type RowStatus = "PASS" | "FAIL" | "NOT RUN";

type TestRow = {
  id: string;
  name: string;
  prediction: string;
  observed: string;
  status: RowStatus;
  error: VcpError | null;
};

const INITIAL_ROWS: TestRow[] = [
  {
    id: "T1",
    name: "T1 unknown session",
    prediction: "kind session-not-found, code V0001 (httpStatus often 400)",
    observed: "",
    status: "NOT RUN",
    error: null,
  },
  {
    id: "T2",
    name: "T2 create session",
    prediction: "status created, version 0",
    observed: "",
    status: "NOT RUN",
    error: null,
  },
  {
    id: "T3",
    name: "T3 attach calibration",
    prediction: "uuid returned; getSession version still 0",
    observed: "",
    status: "NOT RUN",
    error: null,
  },
  {
    id: "T4",
    name: "T4 pair",
    prediction: "status paired, version 1",
    observed: "",
    status: "NOT RUN",
    error: null,
  },
  {
    id: "T5",
    name: "T5 stale pair",
    prediction: "kind version-conflict, code V0002; loadSession version 1",
    observed: "",
    status: "NOT RUN",
    error: null,
  },
  {
    id: "T6",
    name: "T6 set state",
    prediction: "status running, version 2",
    observed: "",
    status: "NOT RUN",
    error: null,
  },
  {
    id: "T7",
    name: "T7 record presentation",
    prediction: "uuid returned; getSession version still 2",
    observed: "",
    status: "NOT RUN",
    error: null,
  },
  {
    id: "T8",
    name: "T8 idempotent submit",
    prediction:
      "sent duplicate false; same clientRequestId; wrapper duplicate true; version 2",
    observed: "",
    status: "NOT RUN",
    error: null,
  },
];

function updateRow(rows: TestRow[], id: string, patch: Partial<TestRow>): TestRow[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

export default function SessionHarness() {
  const snapshot = useSessionStore();
  const { ready, calibration, validity } = useCalibration();
  const [rows, setRows] = useState<TestRow[]>(INITIAL_ROWS);
  const [running, setRunning] = useState(false);
  const [createdSessionIds, setCreatedSessionIds] = useState<string[]>([]);

  async function runAll(): Promise<void> {
    if (running) {
      return;
    }
    setRunning(true);
    setRows(INITIAL_ROWS);
    setCreatedSessionIds([]);

    let nextRows = INITIAL_ROWS;

    function mark(
      id: string,
      status: RowStatus,
      observed: string,
      error: VcpError | null,
    ): void {
      nextRows = updateRow(nextRows, id, { status, observed, error });
      setRows(nextRows);
    }

    try {
      // T1
      {
        const unknownId = newClientRequestId();
        const result = await getSession(unknownId);
        if (
          !result.ok &&
          result.error.kind === "session-not-found" &&
          result.error.code === "V0001"
        ) {
          mark(
            "T1",
            "PASS",
            `kind=${result.error.kind} code=${result.error.code} httpStatus=${String(result.error.httpStatus)}`,
            null,
          );
        } else if (!result.ok) {
          mark(
            "T1",
            "FAIL",
            `kind=${result.error.kind} code=${String(result.error.code)} httpStatus=${String(result.error.httpStatus)}`,
            result.error,
          );
          return;
        } else {
          mark("T1", "FAIL", "unexpected success", null);
          return;
        }
      }

      // T2
      {
        const result = await createSession({
          distanceMmRequested: 2000,
          clientBuild: "harness-8b",
        });
        if (!result.ok) {
          mark("T2", "FAIL", result.error.message, result.error);
          return;
        }
        setCreatedSessionIds((prev) => [...prev, result.data.id]);
        if (result.data.status === "created" && result.data.version === 0) {
          mark(
            "T2",
            "PASS",
            `id=${result.data.id} status=${result.data.status} version=${String(result.data.version)}`,
            null,
          );
        } else {
          mark(
            "T2",
            "FAIL",
            `status=${result.data.status} version=${String(result.data.version)}`,
            null,
          );
          return;
        }
      }

      // T3
      {
        if (!ready || calibration === null || validity === null || !validity.ok) {
          mark("T3", "NOT RUN", "Calibrate on this address first", null);
          return;
        }
        const attached = await attachCalibration(calibration);
        if (!attached.ok) {
          mark("T3", "FAIL", attached.error.message, attached.error);
          return;
        }
        const sessionId = getSnapshot().sessionId;
        if (sessionId === null) {
          mark("T3", "FAIL", "no session after attach", null);
          return;
        }
        const viewed = await getSession(sessionId);
        if (!viewed.ok) {
          mark("T3", "FAIL", viewed.error.message, viewed.error);
          return;
        }
        if (viewed.data.version === 0) {
          mark(
            "T3",
            "PASS",
            `calibrationId=${attached.data} version=${String(viewed.data.version)}`,
            null,
          );
        } else {
          mark(
            "T3",
            "FAIL",
            `version=${String(viewed.data.version)} after attach`,
            null,
          );
          return;
        }
      }

      // T4
      {
        const result = await pair();
        if (!result.ok) {
          mark("T4", "FAIL", result.error.message, result.error);
          return;
        }
        if (result.data.status === "paired" && result.data.version === 1) {
          mark(
            "T4",
            "PASS",
            `status=${result.data.status} version=${String(result.data.version)}`,
            null,
          );
        } else {
          mark(
            "T4",
            "FAIL",
            `status=${result.data.status} version=${String(result.data.version)}`,
            null,
          );
          return;
        }
      }

      // T5
      {
        const sessionId = getSnapshot().sessionId;
        if (sessionId === null) {
          mark("T5", "FAIL", "no session id", null);
          return;
        }
        const stale = await pairSession({
          sessionId,
          expectedVersion: 0,
        });
        if (
          !stale.ok &&
          stale.error.kind === "version-conflict" &&
          stale.error.code === "V0002"
        ) {
          const loaded = await loadSession(sessionId);
          if (!loaded.ok) {
            mark("T5", "FAIL", loaded.error.message, loaded.error);
            return;
          }
          if (loaded.data.version === 1) {
            mark(
              "T5",
              "PASS",
              `kind=${stale.error.kind} code=${stale.error.code}; loaded version=${String(loaded.data.version)}`,
              null,
            );
          } else {
            mark(
              "T5",
              "FAIL",
              `conflict ok but loaded version=${String(loaded.data.version)}`,
              null,
            );
            return;
          }
        } else if (!stale.ok) {
          mark(
            "T5",
            "FAIL",
            `kind=${stale.error.kind} code=${String(stale.error.code)}`,
            stale.error,
          );
          return;
        } else {
          mark("T5", "FAIL", "stale pair unexpectedly succeeded", null);
          return;
        }
      }

      // T6
      {
        const result = await setState("running", {});
        if (!result.ok) {
          mark("T6", "FAIL", result.error.message, result.error);
          return;
        }
        if (result.data.status === "running" && result.data.version === 2) {
          mark(
            "T6",
            "PASS",
            `status=${result.data.status} version=${String(result.data.version)}`,
            null,
          );
        } else {
          mark(
            "T6",
            "FAIL",
            `status=${result.data.status} version=${String(result.data.version)}`,
            null,
          );
          return;
        }
      }

      // T7
      {
        if (calibration === null) {
          mark("T7", "NOT RUN", "Calibrate on this address first", null);
          return;
        }
        const distanceMm = 2000;
        const logMar = 0.3;
        const letterHeightMm = letterHeightMmForLogMar(logMar, distanceMm);
        const strokeWidthMm = strokeWidthMmForLogMar(logMar, distanceMm);
        const letterHeightCssPx = letterHeightMm * calibration.cssPxPerMm;
        const letterHeightDevicePx =
          letterHeightCssPx * calibration.devicePixelRatio;

        const payload: PresentationPayload = {
          trial_index: 0,
          eye: "both",
          logmar_step_index: 3,
          requested_letter_height_mm: letterHeightMm,
          requested_stroke_width_mm: strokeWidthMm,
          requested_letter_height_css_px: letterHeightCssPx,
          requested_letter_height_device_px: letterHeightDevicePx,
          optotypes: ["H"],
          target_index: 0,
          format: "single",
          distance_mm_requested: distanceMm,
        };

        const recorded = await recordPresentation(payload);
        if (!recorded.ok) {
          mark("T7", "FAIL", recorded.error.message, recorded.error);
          return;
        }

        const sessionId = getSnapshot().sessionId;
        if (sessionId === null) {
          mark("T7", "FAIL", "no session after presentation", null);
          return;
        }
        const viewed = await getSession(sessionId);
        if (!viewed.ok) {
          mark("T7", "FAIL", viewed.error.message, viewed.error);
          return;
        }
        if (viewed.data.version === 2) {
          mark(
            "T7",
            "PASS",
            `presentationId=${recorded.data} version=${String(viewed.data.version)}`,
            null,
          );
        } else {
          mark(
            "T7",
            "FAIL",
            `version=${String(viewed.data.version)} after presentation`,
            null,
          );
          return;
        }

        // T8 uses this presentation id
        const presentationId = recorded.data;

        // T8
        {
          const first = await submitResponse(
            presentationId,
            { kind: "letter", letter: "H" },
            850,
          );
          if (!first.ok) {
            mark("T8", "FAIL", first.error.message, first.error);
            return;
          }
          if (first.data.state !== "sent" || first.data.duplicate !== false) {
            mark(
              "T8",
              "FAIL",
              `state=${first.data.state} duplicate=${String(first.data.duplicate)}`,
              first.data.error,
            );
            return;
          }

          const second = await submitResponse(
            presentationId,
            { kind: "letter", letter: "H" },
            850,
          );
          if (!second.ok) {
            mark("T8", "FAIL", second.error.message, second.error);
            return;
          }
          if (second.data.clientRequestId !== first.data.clientRequestId) {
            mark(
              "T8",
              "FAIL",
              `clientRequestId changed: ${first.data.clientRequestId} vs ${second.data.clientRequestId}`,
              null,
            );
            return;
          }

          const sid = getSnapshot().sessionId;
          if (sid === null) {
            mark("T8", "FAIL", "no session for wrapper resubmit", null);
            return;
          }

          const wrapped = await rpcSubmitResponse({
            sessionId: sid,
            presentationId,
            clientRequestId: first.data.clientRequestId,
            choice: first.data.choice,
            respondedAtIso: first.data.respondedAtIso,
            latencyMs: first.data.latencyMs,
          });
          if (!wrapped.ok) {
            mark("T8", "FAIL", wrapped.error.message, wrapped.error);
            return;
          }
          if (
            wrapped.data.id !== first.data.responseId ||
            wrapped.data.duplicate !== true
          ) {
            mark(
              "T8",
              "FAIL",
              `wrapper id=${wrapped.data.id} duplicate=${String(wrapped.data.duplicate)} expected id=${String(first.data.responseId)}`,
              null,
            );
            return;
          }

          const after = await getSession(sid);
          if (!after.ok) {
            mark("T8", "FAIL", after.error.message, after.error);
            return;
          }
          if (after.data.version !== 2) {
            mark(
              "T8",
              "FAIL",
              `version=${String(after.data.version)} after submit`,
              null,
            );
            return;
          }

          mark(
            "T8",
            "PASS",
            `responseId=${wrapped.data.id} clientRequestId=${first.data.clientRequestId} duplicate=${String(wrapped.data.duplicate)} version=2`,
            null,
          );
        }
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12 text-left text-neutral-300">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-neutral-100">Session harness</h1>
        <p className="text-neutral-400">
          Live RPC and store checks against the applied public surface. Creates
          rows tagged client_build harness-8b. No cleanup.
        </p>
        <Link
          href="/display"
          className="w-fit text-sky-400 underline underline-offset-4 hover:text-sky-300"
        >
          Back to /display
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={running}
          onClick={() => {
            void runAll();
          }}
          className="rounded border border-neutral-600 bg-neutral-900 px-4 py-2 text-neutral-100 disabled:opacity-50"
        >
          {running ? "Running…" : "Run all"}
        </button>
        <p className="text-sm text-neutral-500">
          Store: {snapshot.sessionId ?? "none"} · {snapshot.status ?? "—"} · v
          {snapshot.version === null ? "—" : String(snapshot.version)}
        </p>
      </div>

      {createdSessionIds.length > 0 ? (
        <div className="text-sm text-neutral-400">
          <p className="font-medium text-neutral-200">Session ids created</p>
          <ul className="mt-1 list-inside list-disc font-mono text-xs">
            {createdSessionIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-700 text-neutral-400">
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Prediction</th>
              <th className="py-2 pr-3 font-medium">Observed</th>
              <th className="py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-neutral-800 align-top">
                <td className="py-3 pr-3 text-neutral-100">{row.name}</td>
                <td className="py-3 pr-3 text-neutral-400">{row.prediction}</td>
                <td className="py-3 pr-3 font-mono text-xs text-neutral-300">
                  {row.observed || "—"}
                  {row.status === "FAIL" && row.error !== null ? (
                    <div className="mt-1 text-red-400">
                      code={String(row.error.code)} httpStatus=
                      {String(row.error.httpStatus)} message={row.error.message}
                    </div>
                  ) : null}
                </td>
                <td className="py-3 font-semibold">
                  <span
                    className={
                      row.status === "PASS"
                        ? "text-emerald-400"
                        : row.status === "FAIL"
                          ? "text-red-400"
                          : "text-neutral-500"
                    }
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
