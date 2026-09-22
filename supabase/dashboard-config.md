# Dashboard-only settings

These settings exist only in the Supabase dashboard. They appear in no migration.

## Exposed schemas

Must remain `public, graphql_public`. Must NEVER include `vcp`.

Adding `vcp` to exposed schemas would publish every table through PostgREST and defeat the entire security model.

Where: Project Settings, API, Exposed schemas.

## Automatically expose new tables

**OFF.** Turned off and saved 22 September 2026.

Where: Project Settings → API → Data API Settings → Automatically expose new tables (or equivalent Autocomplete / expose toggle for new objects in `public`).

Turning it off revoked function default privileges for `anon` / `authenticated` / `service_role` and revoked table `SELECT`, `INSERT`, `UPDATE`, `DELETE` from those roles' default privileges. It left residual table defaults `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN` (`Dxtm`) and sequence default `UPDATE` (`w`). Migration `20260922120000_vcp_privileges_tidy` removes those residuals (and revokes `service_role` EXECUTE on the ten RPCs).
