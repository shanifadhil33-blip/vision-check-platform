# Ops SQL

A human pastes every file by hand into the Supabase SQL editor. The Supabase CLI is never used.

Files under `supabase/migrations` are the git record and are never executed. The apply copy under this directory is the only schema file that runs.

## Run order

1. Paste `20260908120000_vcp_initial_schema.preflight.sql`. Read the verdict. Continue only if it is `SAFE TO APPLY`.
2. Paste `20260908120000_vcp_initial_schema.apply.sql`.
3. Paste `20260908120000_vcp_initial_schema.verify.sql`. Read the verdict. Continue only if it is `MIGRATION VERIFIED`.
4. Paste `fingerprint.sql`. Record the baseline.

`20260908120000_vcp_initial_schema.rollback.sql` is emergency only. It destroys all data in schema `vcp`.

## Run order — 20260908140000_vcp_rpc_surface

1. Paste `20260908140000_vcp_rpc_surface.preflight.sql`. Read the verdict. Continue only if it is `SAFE TO APPLY`.
2. Paste `20260908140000_vcp_rpc_surface.apply.sql`.
3. Paste `20260908140000_vcp_rpc_surface.verify.sql`. Read the verdict. Continue only if it is `MIGRATION VERIFIED`.
4. Paste `fingerprint-rpc.sql`. Record the RPC baseline.

`20260908140000_vcp_rpc_surface.rollback.sql` is emergency only. It drops the ten public RPCs and the tracking row for this version. It does not touch schema `vcp` or any table.

## Run order — 20260922120000_vcp_privileges_tidy

1. Paste `20260922120000_vcp_privileges_tidy.preflight.sql`. Read the verdict. Continue only if it is `SAFE TO APPLY`.
2. Paste `20260922120000_vcp_privileges_tidy.apply.sql`.
3. Paste `20260922120000_vcp_privileges_tidy.verify.sql`. Read the verdict. Continue only if it is `MIGRATION VERIFIED`.
4. Paste `fingerprint-rpc.sql`. Record the RPC baseline (expected to change: fingerprint includes `proacl`).
5. Paste `fingerprint.sql`. Confirm the table fingerprint is unchanged.

Never run `supabase/migrations/20260922120000_vcp_privileges_tidy.sql` (git record only).

Never run `20260922120000_vcp_privileges_tidy.rollback.sql` unless told. It is emergency only: it restores `service_role` EXECUTE on the ten RPCs and the residual default privileges measured on 22 September.

## Run order — 20260923120000_vcp_get_answered_trials

1. Paste `20260923120000_vcp_get_answered_trials.preflight.sql`. Read the verdict. Continue only if it is `SAFE TO APPLY`.
2. Paste `20260923120000_vcp_get_answered_trials.apply.sql`.
3. Paste `20260923120000_vcp_get_answered_trials.verify.sql`. Read the verdict. Continue only if it is `MIGRATION VERIFIED`.
4. Paste `20260923120000_vcp_get_answered_trials.smoketest.sql`. Read the verdict. Continue only if it is `SMOKE TEST PASSED`.
5. Paste `fingerprint-rpc.sql`. Record the RPC baseline (expected to change: new function).
6. Paste `fingerprint.sql`. Confirm the table fingerprint is unchanged (`9fecaa86562f6a2a9f42d916b52745c3`).

Never run `supabase/migrations/20260923120000_vcp_get_answered_trials.sql` (git record only).

Never run `20260923120000_vcp_get_answered_trials.rollback.sql` unless told. It is emergency only: it drops `public.vcp_get_answered_trials(uuid)` and deletes the tracking row.

## Run order — 20260924120000_vcp_sweep_abandoned_sessions

1. Paste `20260924120000_vcp_sweep_abandoned_sessions.preflight.sql`. Read the verdict. Continue only if it is `SAFE TO APPLY`.
2. Paste `20260924120000_vcp_sweep_abandoned_sessions.apply.sql`.
3. Paste `20260924120000_vcp_sweep_abandoned_sessions.verify.sql`. Read the verdict. Continue only if it is `MIGRATION VERIFIED`.
4. Paste `20260924120000_vcp_sweep_abandoned_sessions.smoketest.sql`. Read the verdict. Continue only if it is `SMOKE TEST PASSED`.
5. Paste `fingerprint-rpc.sql`. Record the RPC baseline (may be unchanged: fingerprint hashes names, arguments, return type, flags and ACLs, not bodies).
6. Paste `fingerprint.sql`. Confirm the table fingerprint is unchanged (`9fecaa86562f6a2a9f42d916b52745c3`).

Never run `supabase/migrations/20260924120000_vcp_sweep_abandoned_sessions.sql` (git record only).

Never run `20260924120000_vcp_sweep_abandoned_sessions.rollback.sql` unless told. It is emergency only: it restores the previous body of `public.vcp_create_session(integer, text)` and deletes the tracking row. Sessions already set to `abandoned` are not reopened.

## Run order — 20260926120000_vcp_calibrations_method_ruler_bar

1. Live-state check: read the live `calibrations_method_chk` definition and the registered versions in `vcp.schema_migrations`. Continue only if they match the migration files.
2. Paste `20260926120000_vcp_calibrations_method_ruler_bar.preflight.sql`. Read the verdict. Continue only if it is `SAFE TO APPLY`.
3. Paste `20260926120000_vcp_calibrations_method_ruler_bar.apply.sql`.
4. Paste `20260926120000_vcp_calibrations_method_ruler_bar.verify.sql`. Read the verdict. Continue only if it is `MIGRATION VERIFIED`.
5. Paste `20260926120000_vcp_calibrations_method_ruler_bar.smoketest.sql`. Read the verdict. Continue only if it is `SMOKE TEST PASSED`.
6. Paste `fingerprint-rpc.sql`. Confirm the RPC baseline is unchanged (`4174314eb9ad3ba7bbbf8cf2fa94e4df`).
7. Paste `fingerprint.sql`. Record the table baseline (expected to change: `calibrations_method_chk` now allows `card-id1` and `ruler-bar`).
8. Commit the migration files and the baseline entry on their own, with no app code.

Never run `supabase/migrations/20260926120000_vcp_calibrations_method_ruler_bar.sql` (git record only).

Never run `20260926120000_vcp_calibrations_method_ruler_bar.rollback.sql` unless told. It is emergency only: it narrows `calibrations_method_chk` back to `card-id1` and deletes the tracking row. If any calibration row has method `ruler-bar` it raises and changes nothing.

## Run order — 20261101120000_vcp_landolt

1. Live-state check: read the live function bodies, grants and registered versions in `vcp.schema_migrations`. Continue only if every one matches the migration files.
2. Paste `20261101120000_vcp_landolt.preflight.sql`. Read the verdict. Continue only if it is `SAFE TO APPLY`.
3. Paste `20261101120000_vcp_landolt.apply.sql`.
4. Paste `20261101120000_vcp_landolt.verify.sql`. Read the verdict. Continue only if it is `MIGRATION VERIFIED`.
5. Paste `20261101120000_vcp_landolt.smoketest.sql`. Read the verdict. Continue only if it is `SMOKE TEST PASSED` with cleanup PASS. It writes one test session to the live database and deletes it.
6. Paste `fingerprint-rpc.sql`. Record the RPC baseline (expected to change: new functions `vcp_set_test_mode` and `vcp_submit_direction_response`).
7. Paste `fingerprint.sql`. Record the table baseline (expected to change: new columns and checks).
8. Commit the migration files and the baseline entry on their own, with no app code.

Never run `supabase/migrations/20261101120000_vcp_landolt.sql` (git record only).

Never run `20261101120000_vcp_landolt.rollback.sql` unless told. It is emergency only: it drops the two new functions, restores `vcp_record_presentation` and `vcp_upsert_test_quality` and the three widened checks, drops the five new columns and deletes the tracking row. If any Landolt C data exists it raises and changes nothing.

## Run order — 20261107120000_vcp_distance_readings

1. Live-state check: read the live columns of `vcp.distance_events`, its four value checks, and the registered versions in `vcp.schema_migrations`. Continue only if they match the migration files and the latest registered version is `20261101120000_vcp_landolt`.
2. Paste `20261107120000_vcp_distance_readings.preflight.sql`. Read the verdict. Continue only if it is `SAFE TO APPLY`.
3. Paste `20261107120000_vcp_distance_readings.apply.sql`.
4. Paste `20261107120000_vcp_distance_readings.verify.sql`. Read the verdict. Continue only if it is `MIGRATION VERIFIED`.
5. Paste `20261107120000_vcp_distance_readings.smoketest.sql`. Read the verdict. Continue only if it is `SMOKE TEST PASSED` with cleanup PASS. It writes two test sessions to the live database and deletes both.
6. Paste `fingerprint-rpc.sql`. Record the RPC baseline (expected to change: new function `vcp_record_distance_readings`).
7. Paste `fingerprint.sql`. Record the table baseline (expected to change: new column `vcp.distance_events.captured_at`).
8. Commit the migration files and the baseline entry on their own, with no app code.

Never run `supabase/migrations/20261107120000_vcp_distance_readings.sql` (git record only).

Never run `20261107120000_vcp_distance_readings.rollback.sql` unless told. It is emergency only: it drops `public.vcp_record_distance_readings(uuid, jsonb)`, drops the column `vcp.distance_events.captured_at` and deletes the tracking row. If any saved reading has `captured_at` set it raises and changes nothing.
