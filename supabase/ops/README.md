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
