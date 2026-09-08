# Fingerprint baselines

Each entry records the output of `supabase/ops/fingerprint.sql` after a verified apply. `fingerprint.sql` is never edited. A changed fingerprint with no corresponding migration means the live schema drifted.

## 20260908120000_vcp_initial_schema

- Version: 20260908120000_vcp_initial_schema
- Applied: 2026-09-08
- Fingerprint: 9fecaa86562f6a2a9f42d916b52745c3
- Verify verdict: MIGRATION VERIFIED, 12 of 12 checks PASS
- Live deny test: sqlstate 42501, permission denied for schema vcp
- Tables: calibrations, distance_events, presentations, responses, schema_migrations, session_events, sessions, test_quality

## Parked

- `vcp.calibrations.session_id` is a foreign key with no index. The only FK without one. Negligible at Phase A row counts.
- `vcp.presentations.logmar` reports nullable. It is derived from a NOT NULL column so it cannot be null in practice.
