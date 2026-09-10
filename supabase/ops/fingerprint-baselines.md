# Fingerprint baselines

Each entry records the output of `supabase/ops/fingerprint.sql` after a verified apply. `fingerprint.sql` is never edited. A changed fingerprint with no corresponding migration means the live schema drifted.

## 20260908120000_vcp_initial_schema

- Version: 20260908120000_vcp_initial_schema
- Applied: 2026-09-08
- Fingerprint: 9fecaa86562f6a2a9f42d916b52745c3
- Verify verdict: MIGRATION VERIFIED, 12 of 12 checks PASS
- Live deny test: sqlstate 42501, permission denied for schema vcp
- Tables: calibrations, distance_events, presentations, responses, schema_migrations, session_events, sessions, test_quality

## 20260908140000_vcp_rpc_surface

- Version: 20260908140000_vcp_rpc_surface
- Applied: 2026-09-09
- Note: applied with a defect, superseded by 20260908160000
- Verify verdict: MIGRATION VERIFIED, 11 of 11
- Smoketest at this point: FAILED, 9 of 18

## 20260908160000_vcp_rpc_coalesce_fix

- Version: 20260908160000_vcp_rpc_coalesce_fix
- Applied: 2026-09-10
- RPC fingerprint: 030cd0f61921171ac8af1bdce623fc14
- Table fingerprint: 9fecaa86562f6a2a9f42d916b52745c3, unchanged
- Verify verdict: MIGRATION VERIFIED, 11 of 11
- Smoketest verdict: SMOKE TEST PASSED, 18 of 18
- Live deny test: sqlstate 42501, permission denied for schema vcp
- Idempotency proven: same response uuid returned twice, duplicate true on the second call

## Parked

- `vcp.calibrations.session_id` is a foreign key with no index. The only FK without one. Negligible at Phase A row counts.
- `vcp.presentations.logmar` reports nullable. It is derived from a NOT NULL column so it cannot be null in practice.
- `service_role` holds EXECUTE on all ten public RPCs, inherited from `pg_default_acl`. The migration revoked from `public`, `anon` and `authenticated` but not `service_role`. Not an escalation, that key already owns the database and has no USAGE on `vcp`. Revoke it in a later migration.
