# /lib/db

Supabase client and typed queries. Nothing lives here yet beyond the browser client.

Only the anon-key browser client lives in this folder. There is no service-role client, by design (AGENTS.md rule 6). Security rests on row level security and grants at the database layer.

`lib/db/types.ts` is written by hand to match the reviewed migration files under /supabase/migrations. It is never generated from a live schema.
