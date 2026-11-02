/**
 * Hand-written types for the two functions added by migration
 * 20261101120000_vcp_landolt (vcp_set_test_mode, vcp_submit_direction_response).
 * Kept in their own file so lib/db/types.ts, which the letter path relies on,
 * stays untouched. Do not generate these from a live schema.
 */

import type { Database, Json } from "./types";

type LandoltFunctions = {
  vcp_set_test_mode: {
    Args: {
      p_session_id: string;
      p_test_mode: string;
    };
    Returns: string;
  };
  vcp_submit_direction_response: {
    Args: {
      p_session_id: string;
      p_presentation_id: string;
      p_client_request_id: string;
      p_response_kind: string;
      p_response_direction: string | null;
      p_responded_at: string;
      p_latency_ms: number | null;
    };
    Returns: Json;
  };
};

export type LandoltDatabase = {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & LandoltFunctions;
  };
};
