/**
 * Database types.
 *
 * Written by hand to match the reviewed migration files under
 * /supabase/migrations. Do not generate these from a live schema.
 * The schema is owned by those migration files (AGENTS.md rule 2).
 *
 * Functions shape matches GenericFunction in
 * node_modules/@supabase/postgrest-js/src/types/common/common.ts
 * (Args + Returns; SetofOptions optional).
 */

import type { Calibration } from "@/lib/calibration";
import type { PresentationPayload } from "./payloads";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      vcp_create_session: {
        Args: {
          p_distance_mm_requested: number;
          p_client_build: string | null;
        };
        Returns: string;
      };
      vcp_get_session: {
        Args: {
          p_session_id: string;
        };
        Returns: Json;
      };
      vcp_get_answered_trials: {
        Args: {
          p_session_id: string;
        };
        Returns: Json;
      };
      vcp_pair_session: {
        Args: {
          p_session_id: string;
          p_expected_version: number;
        };
        Returns: Json;
      };
      vcp_set_session_state: {
        Args: {
          p_session_id: string;
          p_expected_version: number;
          p_status: string;
          p_current_state: Json;
        };
        Returns: Json;
      };
      vcp_attach_calibration: {
        Args: {
          p_session_id: string;
          p_calibration: Calibration;
        };
        Returns: string;
      };
      vcp_record_presentation: {
        Args: {
          p_session_id: string;
          p_presentation: PresentationPayload;
        };
        Returns: string;
      };
      vcp_record_rendered: {
        Args: {
          p_session_id: string;
          p_presentation_id: string;
          p_actual_letter_height_device_px: number;
          p_actual_stroke_width_device_px: number | null;
          p_rendered_at: string;
        };
        Returns: boolean;
      };
      vcp_submit_response: {
        Args: {
          p_session_id: string;
          p_presentation_id: string;
          p_client_request_id: string;
          p_response_kind: string;
          p_response_letter: string | null;
          p_responded_at: string;
          p_latency_ms: number | null;
        };
        Returns: Json;
      };
      vcp_append_event: {
        Args: {
          p_session_id: string;
          p_type: string;
          p_payload: Json;
        };
        Returns: string;
      };
      vcp_upsert_test_quality: {
        Args: {
          p_session_id: string;
          p_eye: string;
          p_quality: Json;
        };
        Returns: string;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
