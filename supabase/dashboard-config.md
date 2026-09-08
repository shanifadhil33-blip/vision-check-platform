# Dashboard-only settings

These settings exist only in the Supabase dashboard. They appear in no migration.

## Exposed schemas

Must remain `public, graphql_public`. Must NEVER include `vcp`.

Adding `vcp` to exposed schemas would publish every table through PostgREST and defeat the entire security model.

Where: Project Settings, API, Exposed schemas.
