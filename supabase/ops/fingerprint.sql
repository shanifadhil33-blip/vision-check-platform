-- THIS FILE IS NEVER EDITED.
-- EDITING IT MAKES EVERY PREVIOUSLY RECORDED BASELINE INCOMPARABLE.
-- Read only. Paste into the Supabase SQL editor after a verified apply.
-- Version: 20260908120000_vcp_initial_schema
-- One statement, one json cell. Catalogues only.
-- The Supabase CLI is never used.

select jsonb_pretty(
  listing
  || jsonb_build_object(
    'fingerprint', md5(listing::text)
  )
) as recon
from (
  select jsonb_build_object(
    'tables', coalesce((
      select jsonb_agg(c.relname order by c.relname)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'vcp'
        and c.relkind in ('r', 'p')
    ), '[]'::jsonb),
    'columns', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'table', c.relname,
          'column', a.attname,
          'ordinal', a.attnum,
          'data_type', format_type(a.atttypid, a.atttypmod),
          'not_null', a.attnotnull,
          'default', pg_get_expr(ad.adbin, ad.adrelid),
          'is_generated', a.attgenerated
        )
        order by c.relname, a.attnum
      )
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef ad
        on ad.adrelid = a.attrelid
       and ad.adnum = a.attnum
      where n.nspname = 'vcp'
        and c.relkind in ('r', 'p')
        and a.attnum > 0
        and not a.attisdropped
    ), '[]'::jsonb),
    'constraints', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'table', c.relname,
          'name', con.conname,
          'type', con.contype,
          'def', pg_get_constraintdef(con.oid)
        )
        order by c.relname, con.conname
      )
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'vcp'
        and c.relkind in ('r', 'p')
    ), '[]'::jsonb),
    'indexes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'table', t.relname,
          'name', i.relname,
          'indexdef', pg_get_indexdef(i.oid)
        )
        order by t.relname, i.relname
      )
      from pg_index x
      join pg_class i on i.oid = x.indexrelid
      join pg_class t on t.oid = x.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'vcp'
        and t.relkind in ('r', 'p')
    ), '[]'::jsonb),
    'rls', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'table', c.relname,
          'relrowsecurity', c.relrowsecurity,
          'relforcerowsecurity', c.relforcerowsecurity
        )
        order by c.relname
      )
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'vcp'
        and c.relkind in ('r', 'p')
    ), '[]'::jsonb),
    'relacl', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'table', c.relname,
          'relacl', case
            when c.relacl is null then null
            else (
              select jsonb_agg(acl::text order by acl::text)
              from unnest(c.relacl) as acl
            )
          end
        )
        order by c.relname
      )
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'vcp'
        and c.relkind in ('r', 'p')
    ), '[]'::jsonb)
  ) as listing
) as built;
