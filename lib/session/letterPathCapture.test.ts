/**
 * Letter path capture. Every expected string below was produced by the
 * letter code as it stood at b0579d9, before any Landolt C change, and is
 * pasted here as a literal. The Landolt C build must leave each one equal.
 * Covers the loop-state writers and parser, the RPC argument builders, the
 * session store send path and the submit-result parser for letters.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: unknown[] = [];

vi.mock("@/lib/db/client", () => ({
  getSupabaseBrowserClient: () => ({
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      if (name === "vcp_get_session") {
        return Promise.resolve({
          data: {
            id: "s-1",
            status: "running",
            version: 7,
            current_state: {},
            distance_mm_requested: 3000,
            created_at: "x",
            updated_at: "y",
          },
          error: null,
          status: 200,
        });
      }
      if (name === "vcp_submit_response") {
        const a = args as { p_response_kind: string; p_response_letter: string | null };
        return Promise.resolve({
          data: {
            id: "resp-1",
            response_kind: a.p_response_kind,
            response_letter: a.p_response_letter,
            duplicate: false,
          },
          error: null,
          status: 200,
        });
      }
      return Promise.resolve({
        data: "00000000-0000-4000-8000-000000000001",
        error: null,
        status: 200,
      });
    },
  }),
}));

vi.mock("./clientRequestId", () => ({
  newClientRequestId: () => "11111111-2222-4333-8444-555555555555",
}));

import * as rpc from "@/lib/db/rpc";
import * as payloads from "@/lib/db/payloads";
import * as loop from "./loopState";
import * as store from "./sessionStore";

const RUN: loop.RunContext = {
  correction: "glasses",
  stepIndices: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  finestLimitedBy: "requested-bound",
  coarsestLimitedBy: "viewport-size",
  voidedTrialIndices: [1, 4],
};

const RUN_JSON =
  '{"correction":"glasses","stepIndices":[-1,0,1,2,3,4,5,6,7,8,9,10],"finestLimitedBy":"requested-bound","coarsestLimitedBy":"viewport-size","voidedTrialIndices":[1,4]}';

const CAPTURED = {
  ready: `{"phase":"ready","run":${RUN_JSON}}`,
  readyPos: `{"phase":"ready","positionConfirmed":true,"run":${RUN_JSON}}`,
  readyBare: '{"phase":"ready"}',
  awaiting: `{"phase":"awaiting_response","trialIndex":3,"presentationId":"p-3","choices":["C","D","H","K","N"],"run":${RUN_JSON}}`,
  respondedLetter: `{"phase":"responded","trialIndex":3,"presentationId":"p-3","responseId":"r-3","responseKind":"letter","responseLetter":"H","run":${RUN_JSON}}`,
  respondedNotSure:
    '{"phase":"responded","trialIndex":4,"presentationId":"p-4","responseId":"r-4","responseKind":"not_sure","responseLetter":null}',
  complete: `{"phase":"complete","trialsCompleted":12,"run":${RUN_JSON},"result":{"kind":"measured","stepIndex":2},"nextSessionId":"0d7c3f9e-1b2a-4c3d-8e4f-5a6b7c8d9e0f"}`,
  completeNm: `{"phase":"complete","trialsCompleted":5,"run":${RUN_JSON},"result":{"kind":"not-measurable","coarsestStepIndex":10}}`,
  completeBare: '{"phase":"complete","trialsCompleted":0}',
};

beforeEach(() => {
  calls.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("letter loop-state writers", () => {
  it("readyState with a run is unchanged", () => {
    expect(JSON.stringify(loop.readyState(RUN))).toBe(CAPTURED.ready);
  });

  it("readyState with positionConfirmed is unchanged", () => {
    expect(JSON.stringify(loop.readyState(RUN, { positionConfirmed: true }))).toBe(
      CAPTURED.readyPos,
    );
  });

  it("readyState with no run is unchanged", () => {
    expect(JSON.stringify(loop.readyState(null))).toBe(CAPTURED.readyBare);
    expect(JSON.stringify(loop.readyState())).toBe(CAPTURED.readyBare);
  });

  it("awaitingResponseState is unchanged", () => {
    expect(
      JSON.stringify(
        loop.awaitingResponseState({
          trialIndex: 3,
          presentationId: "p-3",
          choices: ["C", "D", "H", "K", "N"],
          run: RUN,
        }),
      ),
    ).toBe(CAPTURED.awaiting);
  });

  it("respondedState for a letter is unchanged", () => {
    expect(
      JSON.stringify(
        loop.respondedState({
          trialIndex: 3,
          presentationId: "p-3",
          responseId: "r-3",
          responseKind: "letter",
          responseLetter: "H",
          run: RUN,
        }),
      ),
    ).toBe(CAPTURED.respondedLetter);
  });

  it("respondedState for not sure is unchanged", () => {
    expect(
      JSON.stringify(
        loop.respondedState({
          trialIndex: 4,
          presentationId: "p-4",
          responseId: "r-4",
          responseKind: "not_sure",
          responseLetter: null,
        }),
      ),
    ).toBe(CAPTURED.respondedNotSure);
  });

  it("completeState variants are unchanged", () => {
    expect(
      JSON.stringify(
        loop.completeState(12, {
          run: RUN,
          result: { kind: "measured", stepIndex: 2 },
          nextSessionId: "0d7c3f9e-1b2a-4c3d-8e4f-5a6b7c8d9e0f",
        }),
      ),
    ).toBe(CAPTURED.complete);
    expect(
      JSON.stringify(
        loop.completeState(5, { run: RUN, result: { kind: "not-measurable", coarsestStepIndex: 10 } }),
      ),
    ).toBe(CAPTURED.completeNm);
    expect(JSON.stringify(loop.completeState(0))).toBe(CAPTURED.completeBare);
  });
});

describe("letter loop-state parser", () => {
  it("parses every letter input exactly as before", () => {
    const inputs: unknown[] = [
      JSON.parse(CAPTURED.ready),
      JSON.parse(CAPTURED.readyPos),
      JSON.parse(CAPTURED.awaiting),
      JSON.parse(CAPTURED.respondedLetter),
      JSON.parse(CAPTURED.respondedNotSure),
      JSON.parse(CAPTURED.complete),
      JSON.parse(CAPTURED.completeNm),
      { phase: "awaiting_response", trialIndex: 1, presentationId: "p", choices: ["C", "D"], run: RUN },
      { phase: "ready", run: { ...RUN, correction: "specs" } },
      { phase: "ready", run: RUN, positionConfirmed: "yes" },
      {
        phase: "responded",
        trialIndex: 1,
        presentationId: "p",
        responseId: "r",
        responseKind: "letter",
        responseLetter: "Q",
        run: RUN,
      },
      {
        phase: "complete",
        trialsCompleted: 2,
        run: RUN,
        result: { kind: "inconsistent" },
        nextSessionId: "nope",
      },
      { phase: "bogus" },
      null,
    ];
    expect(JSON.stringify(inputs.map((value) => loop.parseLoopState(value) ?? "NULL"))).toBe(
      `[{"phase":"ready","run":${RUN_JSON}},` +
        `{"phase":"ready","run":${RUN_JSON},"positionConfirmed":true},` +
        `{"phase":"awaiting_response","trialIndex":3,"presentationId":"p-3","choices":["C","D","H","K","N"],"run":${RUN_JSON}},` +
        `{"phase":"responded","trialIndex":3,"presentationId":"p-3","responseId":"r-3","responseKind":"letter","responseLetter":"H","run":${RUN_JSON}},` +
        '{"phase":"responded","trialIndex":4,"presentationId":"p-4","responseId":"r-4","responseKind":"not_sure","responseLetter":null,"run":null},' +
        `{"phase":"complete","trialsCompleted":12,"run":${RUN_JSON},"result":{"kind":"measured","stepIndex":2},"nextSessionId":"0d7c3f9e-1b2a-4c3d-8e4f-5a6b7c8d9e0f"},` +
        `{"phase":"complete","trialsCompleted":5,"run":${RUN_JSON},"result":{"kind":"not-measurable","coarsestStepIndex":10},"nextSessionId":null},` +
        '"NULL",' +
        '{"phase":"ready","run":null},' +
        '"NULL",' +
        '"NULL",' +
        `{"phase":"complete","trialsCompleted":2,"run":${RUN_JSON},"result":null,"nextSessionId":null},` +
        '"NULL",' +
        '"NULL"]',
    );
  });

  it("parseRunContext is unchanged, extra keys dropped", () => {
    expect(
      JSON.stringify([
        loop.parseRunContext(RUN),
        loop.parseRunContext({ ...RUN, testMode: "landolt", eye: "left" }),
      ]),
    ).toBe(`[${RUN_JSON},${RUN_JSON}]`);
  });
});

describe("letter RPC argument builders", () => {
  it("every letter RPC sends the same name and arguments", async () => {
    await rpc.getSession("s-1");
    await rpc.getAnsweredTrials("s-1");
    await rpc.createSession({ distanceMmRequested: 3000, clientBuild: "m6-distance-4" });
    await rpc.pairSession({ sessionId: "s-1", expectedVersion: 2 });
    await rpc.setSessionState({
      sessionId: "s-1",
      expectedVersion: 3,
      status: "running",
      currentState: loop.readyState(RUN),
    });
    await rpc.attachCalibration({
      sessionId: "s-1",
      calibration: {
        cssPxPerMm: 4,
        cardWidthCssPx: 342.4,
        devicePixelRatio: 2,
        viewportWidthCssPx: 1280,
        viewportHeightCssPx: 800,
        screenWidthCssPx: 1920,
        screenHeightCssPx: 1080,
        userAgent: "ua",
        createdAtIso: "2026-10-01T00:00:00.000Z",
        method: "card-id1",
        verifications: [],
      },
    });
    await rpc.recordPresentation({
      sessionId: "s-1",
      presentation: {
        trial_index: 3,
        eye: "both",
        logmar_step_index: 2,
        requested_letter_height_mm: 6.9,
        requested_stroke_width_mm: 1.38,
        requested_letter_height_css_px: 27.6,
        requested_letter_height_device_px: 55.2,
        optotypes: ["D", "H", "K"],
        target_index: 1,
        format: "flanked-triplet",
        distance_mm_requested: 3000,
        actual_letter_height_device_px: 55,
        rendered_at: "2026-11-01T12:00:00.000Z",
        visibility_confirmed: true,
        crowding_spec: { spacing_letter_widths: 1 },
      },
    });
    await rpc.recordRendered({
      sessionId: "s-1",
      presentationId: "p-1",
      actualLetterHeightDevicePx: 55,
      actualStrokeWidthDevicePx: null,
      renderedAtIso: "2026-11-01T12:00:00.000Z",
    });
    await rpc.submitResponse({
      sessionId: "s-1",
      presentationId: "p-1",
      clientRequestId: "c-1",
      choice: { kind: "letter", letter: "H" },
      respondedAtIso: "2026-11-01T12:00:00.000Z",
      latencyMs: 812,
    });
    await rpc.submitResponse({
      sessionId: "s-1",
      presentationId: "p-1",
      clientRequestId: "c-2",
      choice: { kind: "not_sure" },
      respondedAtIso: "2026-11-01T12:00:00.000Z",
      latencyMs: null,
    });
    await rpc.appendEvent({ sessionId: "s-1", type: "test_started", payload: { a: 1 } });
    await rpc.upsertTestQuality({
      sessionId: "s-1",
      eye: "both",
      quality: { distance_requested_mm: 3000 },
    });
    expect(JSON.stringify(calls)).toBe(
      '[["vcp_get_session",{"p_session_id":"s-1"}],' +
        '["vcp_get_answered_trials",{"p_session_id":"s-1"}],' +
        '["vcp_create_session",{"p_distance_mm_requested":3000,"p_client_build":"m6-distance-4"}],' +
        '["vcp_pair_session",{"p_session_id":"s-1","p_expected_version":2}],' +
        `["vcp_set_session_state",{"p_session_id":"s-1","p_expected_version":3,"p_status":"running","p_current_state":{"phase":"ready","run":${RUN_JSON}}}],` +
        '["vcp_attach_calibration",{"p_session_id":"s-1","p_calibration":{"cssPxPerMm":4,"cardWidthCssPx":342.4,"devicePixelRatio":2,"viewportWidthCssPx":1280,"viewportHeightCssPx":800,"screenWidthCssPx":1920,"screenHeightCssPx":1080,"userAgent":"ua","createdAtIso":"2026-11-01T12:00:00.000Z","method":"card-id1","verifications":[]}}],' +
        '["vcp_record_presentation",{"p_session_id":"s-1","p_presentation":{"trial_index":3,"eye":"both","logmar_step_index":2,"requested_letter_height_mm":6.9,"requested_stroke_width_mm":1.38,"requested_letter_height_css_px":27.6,"requested_letter_height_device_px":55.2,"optotypes":["D","H","K"],"target_index":1,"format":"flanked-triplet","distance_mm_requested":3000,"actual_letter_height_device_px":55,"rendered_at":"2026-11-01T12:00:00.000Z","visibility_confirmed":true,"crowding_spec":{"spacing_letter_widths":1}}}],' +
        '["vcp_record_rendered",{"p_session_id":"s-1","p_presentation_id":"p-1","p_actual_letter_height_device_px":55,"p_actual_stroke_width_device_px":null,"p_rendered_at":"2026-11-01T12:00:00.000Z"}],' +
        '["vcp_submit_response",{"p_session_id":"s-1","p_presentation_id":"p-1","p_client_request_id":"c-1","p_response_kind":"letter","p_response_letter":"H","p_responded_at":"2026-11-01T12:00:00.000Z","p_latency_ms":812}],' +
        '["vcp_submit_response",{"p_session_id":"s-1","p_presentation_id":"p-1","p_client_request_id":"c-2","p_response_kind":"not_sure","p_response_letter":null,"p_responded_at":"2026-11-01T12:00:00.000Z","p_latency_ms":null}],' +
        '["vcp_append_event",{"p_session_id":"s-1","p_type":"test_started","p_payload":{"a":1}}],' +
        '["vcp_upsert_test_quality",{"p_session_id":"s-1","p_eye":"both","p_quality":{"distance_requested_mm":3000}}]]',
    );
  });
});

describe("letter session store send path", () => {
  it("letter and not-sure answers and the quality row send the same arguments", async () => {
    store.reset();
    await store.loadSession("s-1");
    await store.submitResponse("p-1", { kind: "letter", letter: "H" }, 812);
    await store.submitResponse("p-2", { kind: "not_sure" }, null);
    await store.upsertTestQuality({ distance_requested_mm: 3000 });
    expect(JSON.stringify(calls)).toBe(
      '[["vcp_get_session",{"p_session_id":"s-1"}],' +
        '["vcp_submit_response",{"p_session_id":"s-1","p_presentation_id":"p-1","p_client_request_id":"11111111-2222-4333-8444-555555555555","p_response_kind":"letter","p_response_letter":"H","p_responded_at":"2026-11-01T12:00:00.000Z","p_latency_ms":812}],' +
        '["vcp_submit_response",{"p_session_id":"s-1","p_presentation_id":"p-2","p_client_request_id":"11111111-2222-4333-8444-555555555555","p_response_kind":"not_sure","p_response_letter":null,"p_responded_at":"2026-11-01T12:00:00.000Z","p_latency_ms":null}],' +
        '["vcp_upsert_test_quality",{"p_session_id":"s-1","p_eye":"both","p_quality":{"distance_requested_mm":3000}}]]',
    );
    expect(JSON.stringify(store.getSnapshot().responses)).toBe(
      '{"p-1":{"clientRequestId":"11111111-2222-4333-8444-555555555555","choice":{"kind":"letter","letter":"H"},"respondedAtIso":"2026-11-01T12:00:00.000Z","latencyMs":812,"state":"sent","responseId":"resp-1","duplicate":false,"error":null,"attempts":1},' +
        '"p-2":{"clientRequestId":"11111111-2222-4333-8444-555555555555","choice":{"kind":"not_sure"},"respondedAtIso":"2026-11-01T12:00:00.000Z","latencyMs":null,"state":"sent","responseId":"resp-1","duplicate":false,"error":null,"attempts":1}}',
    );
  });
});

describe("letter submit-result parser", () => {
  it("parses letter and not-sure results as before and refuses a direction", () => {
    expect(
      JSON.stringify([
        payloads.parseSubmitResult({ id: "r", response_kind: "letter", response_letter: "H", duplicate: false }),
        payloads.parseSubmitResult({ id: "r", response_kind: "not_sure", response_letter: null, duplicate: true }),
        payloads.parseSubmitResult({ id: "r", response_kind: "direction", response_letter: null, duplicate: true }) ??
          "NULL",
      ]),
    ).toBe(
      '[{"id":"r","responseKind":"letter","responseLetter":"H","duplicate":false},' +
        '{"id":"r","responseKind":"not_sure","responseLetter":null,"duplicate":true},' +
        '"NULL"]',
    );
  });
});
