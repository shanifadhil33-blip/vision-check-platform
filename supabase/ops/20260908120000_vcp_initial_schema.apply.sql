-- APPLY COPY. Paste this file only into the Supabase SQL editor.
-- Git record (never executed): supabase/migrations/20260908120000_vcp_initial_schema.sql
-- Version: 20260908120000_vcp_initial_schema
-- Schema body is identical to the git record. Tracking table and insert
-- are in this same transaction so a failure leaves nothing registered.
-- The Supabase CLI is never used.

BEGIN;

create schema vcp;

revoke all on schema vcp from public, anon, authenticated;

alter default privileges in schema vcp
  revoke all on tables from anon, authenticated;

alter default privileges in schema vcp
  revoke all on sequences from anon, authenticated;

alter default privileges in schema vcp
  revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- vcp.sessions
-- ---------------------------------------------------------------------------

create table vcp.sessions (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'created',
  version integer not null default 0,
  current_state jsonb not null default '{}'::jsonb,
  distance_mm_requested integer null,
  client_build text null,
  constraint sessions_pkey primary key (id),
  constraint sessions_status_chk check (
    status in ('created', 'paired', 'running', 'paused', 'complete', 'abandoned')
  ),
  constraint sessions_version_chk check (version >= 0),
  constraint sessions_distance_mm_requested_chk check (distance_mm_requested > 0)
);

alter table vcp.sessions enable row level security;
alter table vcp.sessions force row level security;
revoke all on table vcp.sessions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- vcp.calibrations
-- ---------------------------------------------------------------------------

create table vcp.calibrations (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null,
  css_px_per_mm double precision not null,
  card_width_css_px double precision not null,
  device_pixel_ratio double precision not null,
  viewport_width_css_px integer not null,
  viewport_height_css_px integer not null,
  screen_width_css_px integer not null,
  screen_height_css_px integer not null,
  user_agent text not null,
  method text not null,
  calibrated_at timestamptz not null,
  verifications jsonb not null default '[]'::jsonb,
  constraint calibrations_pkey primary key (id),
  constraint calibrations_session_id_fkey
    foreign key (session_id) references vcp.sessions (id) on delete cascade,
  constraint calibrations_css_px_per_mm_chk check (css_px_per_mm > 0),
  constraint calibrations_card_width_css_px_chk check (card_width_css_px > 0),
  constraint calibrations_device_pixel_ratio_chk check (device_pixel_ratio > 0),
  constraint calibrations_viewport_width_css_px_chk check (viewport_width_css_px > 0),
  constraint calibrations_viewport_height_css_px_chk check (viewport_height_css_px > 0),
  constraint calibrations_screen_width_css_px_chk check (screen_width_css_px > 0),
  constraint calibrations_screen_height_css_px_chk check (screen_height_css_px > 0),
  constraint calibrations_method_chk check (method in ('card-id1')),
  constraint calibrations_verifications_is_array_chk check (jsonb_typeof(verifications) = 'array')
);

comment on column vcp.calibrations.verifications is
  'Mirrors CalibrationVerification[] in lib/calibration/types.ts. Items are {claimedMm, measuredMm, createdAtIso}.';

comment on column vcp.calibrations.calibrated_at is
  'Mirrors Calibration.createdAtIso. Distinct from created_at, which is when this row was written.';

alter table vcp.calibrations enable row level security;
alter table vcp.calibrations force row level security;
revoke all on table vcp.calibrations from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- vcp.presentations
-- ---------------------------------------------------------------------------

create table vcp.presentations (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null,
  trial_index integer not null,
  eye text not null,
  logmar_step_index smallint not null,
  logmar numeric(4, 2) generated always as ((logmar_step_index * 0.1)::numeric(4, 2)) stored,
  requested_letter_height_mm double precision not null,
  requested_stroke_width_mm double precision not null,
  requested_letter_height_css_px double precision not null,
  requested_letter_height_device_px double precision not null,
  actual_letter_height_device_px double precision null,
  actual_stroke_width_device_px double precision null,
  optotypes text[] not null,
  target_index smallint not null,
  format text not null,
  crowding_spec jsonb not null default '{}'::jsonb,
  distance_mm_requested integer not null,
  distance_mm_observed double precision null,
  rendered_at timestamptz null,
  visibility_confirmed boolean not null default false,
  constraint presentations_pkey primary key (id),
  constraint presentations_session_id_fkey
    foreign key (session_id) references vcp.sessions (id) on delete cascade,
  constraint presentations_trial_index_chk check (trial_index >= 0),
  constraint presentations_eye_chk check (eye in ('right', 'left', 'both')),
  constraint presentations_logmar_step_index_chk check (logmar_step_index between -10 and 20),
  constraint presentations_requested_letter_height_mm_chk check (requested_letter_height_mm > 0),
  constraint presentations_requested_stroke_width_mm_chk check (requested_stroke_width_mm > 0),
  constraint presentations_requested_letter_height_css_px_chk check (requested_letter_height_css_px > 0),
  constraint presentations_requested_letter_height_device_px_chk check (requested_letter_height_device_px > 0),
  constraint presentations_optotypes_min_cardinality_chk check (cardinality(optotypes) >= 1),
  constraint presentations_optotypes_sloan_chk check (
    optotypes <@ array['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z']::text[]
  ),
  constraint presentations_target_index_min_chk check (target_index >= 0),
  constraint presentations_target_index_in_optotypes_chk check (target_index < cardinality(optotypes)),
  constraint presentations_format_chk check (format in ('single', 'flanked-triplet', 'row')),
  constraint presentations_distance_mm_requested_chk check (distance_mm_requested > 0),
  constraint presentations_distance_mm_observed_chk check (distance_mm_observed > 0),
  constraint presentations_session_id_trial_index_key unique (session_id, trial_index)
);

comment on table vcp.presentations is
  'The optotype check list is the exact SLOAN_LETTERS constant in lib/acuity/sloan.ts. format includes row even though row is not built in Phase A.';

alter table vcp.presentations enable row level security;
alter table vcp.presentations force row level security;
revoke all on table vcp.presentations from public, anon, authenticated;

-- unique (session_id, trial_index) already provides the index on those columns

-- ---------------------------------------------------------------------------
-- vcp.responses
-- ---------------------------------------------------------------------------

create table vcp.responses (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  presentation_id uuid not null,
  session_id uuid not null,
  client_request_id text not null,
  response_kind text not null,
  response_letter text null,
  responded_at timestamptz not null,
  latency_ms integer null,
  constraint responses_pkey primary key (id),
  constraint responses_presentation_id_fkey
    foreign key (presentation_id) references vcp.presentations (id) on delete cascade,
  constraint responses_session_id_fkey
    foreign key (session_id) references vcp.sessions (id) on delete cascade,
  constraint responses_client_request_id_length_chk check (length(client_request_id) between 8 and 128),
  constraint responses_response_kind_chk check (response_kind in ('letter', 'not_sure')),
  constraint responses_response_letter_sloan_chk check (
    response_letter is null
    or response_letter = any (array['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z'])
  ),
  constraint responses_latency_ms_chk check (latency_ms >= 0),
  constraint responses_kind_letter_consistency_chk check (
    (response_kind = 'letter' and response_letter is not null)
    or (response_kind = 'not_sure' and response_letter is null)
  ),
  constraint responses_presentation_id_client_request_id_key unique (presentation_id, client_request_id)
);

comment on table vcp.responses is
  'The unique constraint on (presentation_id, client_request_id) makes submission idempotent. not_sure counts as incorrect for the staircase but is stored as its own kind and must never be collapsed into a wrong letter.';

create index responses_session_id_idx on vcp.responses (session_id);

alter table vcp.responses enable row level security;
alter table vcp.responses force row level security;
revoke all on table vcp.responses from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- vcp.distance_events
-- ---------------------------------------------------------------------------

create table vcp.distance_events (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null,
  presentation_id uuid null,
  method text not null,
  raw_value double precision null,
  baseline_ratio double precision null,
  absolute_mm double precision null,
  confidence double precision null,
  flagged boolean not null default false,
  constraint distance_events_pkey primary key (id),
  constraint distance_events_session_id_fkey
    foreign key (session_id) references vcp.sessions (id) on delete cascade,
  constraint distance_events_presentation_id_fkey
    foreign key (presentation_id) references vcp.presentations (id) on delete set null,
  constraint distance_events_method_chk check (
    method in ('marker-camera', 'motion-sensor', 'webcam-ipd', 'catch-trial', 'manual-setup')
  ),
  constraint distance_events_baseline_ratio_chk check (baseline_ratio > 0),
  constraint distance_events_absolute_mm_chk check (absolute_mm > 0),
  constraint distance_events_confidence_chk check (confidence between 0 and 1)
);

create index distance_events_session_id_created_at_idx on vcp.distance_events (session_id, created_at);

alter table vcp.distance_events enable row level security;
alter table vcp.distance_events force row level security;
revoke all on table vcp.distance_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- vcp.test_quality
-- ---------------------------------------------------------------------------

create table vcp.test_quality (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null,
  eye text not null,
  calibration_id uuid null,
  distance_requested_mm integer not null,
  distance_observed_min_mm double precision null,
  distance_observed_max_mm double precision null,
  distance_confidence double precision null,
  monitoring_modes_active text[] not null default '{}'::text[],
  renderable_finest_logmar numeric(4, 2) null,
  renderable_coarsest_logmar numeric(4, 2) null,
  finest_limited_by text null,
  coarsest_limited_by text null,
  screen_limited boolean not null default false,
  bounded_result_reason text null,
  response_consistency double precision null,
  not_sure_count integer not null default 0,
  reversals integer not null default 0,
  retries integer not null default 0,
  interruptions integer not null default 0,
  ambient_light_estimate double precision null,
  distance_recommended_mm integer null,
  distance_chosen_mm integer null,
  final_logmar_step_index smallint null,
  final_logmar numeric(4, 2) generated always as ((final_logmar_step_index * 0.1)::numeric(4, 2)) stored,
  final_snellen_label text null,
  constraint test_quality_pkey primary key (id),
  constraint test_quality_session_id_fkey
    foreign key (session_id) references vcp.sessions (id) on delete cascade,
  constraint test_quality_calibration_id_fkey
    foreign key (calibration_id) references vcp.calibrations (id) on delete set null,
  constraint test_quality_eye_chk check (eye in ('right', 'left', 'both')),
  constraint test_quality_distance_requested_mm_chk check (distance_requested_mm > 0),
  constraint test_quality_distance_confidence_chk check (distance_confidence between 0 and 1),
  constraint test_quality_finest_limited_by_chk check (
    finest_limited_by in ('screen-resolution', 'viewport-size', 'requested-bound')
  ),
  constraint test_quality_coarsest_limited_by_chk check (
    coarsest_limited_by in ('screen-resolution', 'viewport-size', 'requested-bound')
  ),
  constraint test_quality_not_sure_count_chk check (not_sure_count >= 0),
  constraint test_quality_reversals_chk check (reversals >= 0),
  constraint test_quality_retries_chk check (retries >= 0),
  constraint test_quality_interruptions_chk check (interruptions >= 0),
  constraint test_quality_distance_recommended_mm_chk check (distance_recommended_mm > 0),
  constraint test_quality_distance_chosen_mm_chk check (distance_chosen_mm > 0),
  constraint test_quality_final_logmar_step_index_chk check (final_logmar_step_index between -10 and 20),
  constraint test_quality_session_id_eye_key unique (session_id, eye)
);

comment on table vcp.test_quality is
  'Client technical validity requirement. Deliberately separate from the acuity result so the two can never be collapsed into one field. finest means the smaller logMAR. The two limited_by lists are the exact RangeLimit union in lib/acuity/renderableRange.ts.';

alter table vcp.test_quality enable row level security;
alter table vcp.test_quality force row level security;
revoke all on table vcp.test_quality from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- vcp.session_events
-- ---------------------------------------------------------------------------

create table vcp.session_events (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  constraint session_events_pkey primary key (id),
  constraint session_events_session_id_fkey
    foreign key (session_id) references vcp.sessions (id) on delete cascade,
  constraint session_events_type_length_chk check (length(type) between 1 and 64)
);

comment on table vcp.session_events is
  'type is deliberately open. Events are a log; a closed list would force a migration every time a new event name is needed.';

create index session_events_session_id_created_at_idx on vcp.session_events (session_id, created_at);

alter table vcp.session_events enable row level security;
alter table vcp.session_events force row level security;
revoke all on table vcp.session_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tracking (apply copy only). Same transaction as the schema body.
-- ---------------------------------------------------------------------------

create table if not exists vcp.schema_migrations (
  version text not null,
  applied_at timestamptz not null default now(),
  constraint schema_migrations_pkey primary key (version)
);

alter table vcp.schema_migrations enable row level security;
alter table vcp.schema_migrations force row level security;
revoke all on table vcp.schema_migrations from public, anon, authenticated;

insert into vcp.schema_migrations (version)
  values ('20260908120000_vcp_initial_schema');

COMMIT;
