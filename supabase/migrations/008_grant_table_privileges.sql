-- Root cause: migration 007 created RLS policies but never granted the
-- underlying table-level privileges those policies depend on. RLS only
-- filters rows AFTER a role passes a privilege check — it does not grant
-- baseline access by itself. Supabase auto-grants SELECT/INSERT/UPDATE/
-- DELETE to anon/authenticated only for tables created by the
-- `supabase_admin` role (its own internal default ACL); these migrations
-- were applied as `postgres`, whose own default ACL for anon/authenticated
-- deliberately excludes those four privileges. Confirmed via
-- information_schema.role_table_grants and pg_default_acl before writing
-- this migration — anon/authenticated had only REFERENCES/TRIGGER/TRUNCATE
-- on all four tables, never SELECT/INSERT/UPDATE/DELETE.
--
-- Grants below are scoped to exactly what each table's existing policies
-- (migration 007) support — no more:
--   - workspaces: SELECT/UPDATE/INSERT policies exist -> grant those three.
--   - workspace_members: only a SELECT policy exists, and must stay that
--     way (DEC-010 / DEC-011 / pre-implementation-audit.md finding S-1) —
--     the only writer is the SECURITY DEFINER create_workspace_with_owner
--     function, which does not need this grant since it runs as its owner.
--     Do NOT add insert/update/delete here.
--   - projects/tasks: SELECT/INSERT/UPDATE/DELETE policies all exist ->
--     grant all four.
--   - anon: receives nothing. No policy anywhere in this schema is scoped
--     to anon, so granting it nothing keeps that true even if a future
--     policy mistake adds one.

grant select, insert, update on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
