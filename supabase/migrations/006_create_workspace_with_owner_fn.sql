-- DEC-010: workspace creation must be atomic and must not rely on a
-- client-facing INSERT policy on workspace_members (see migration 007 and
-- pre-implementation-audit.md finding S-1 / T-2). This function is the only
-- writer of workspace_members in Sprint 1.
--
-- SECURITY DEFINER with an explicit, empty search_path and fully qualified
-- identifiers — the standard hardening for definer functions, preventing a
-- search_path-hijack from redirecting an unqualified reference to a
-- malicious object. Scope is intentionally narrow: this function only ever
-- inserts into public.workspaces and public.workspace_members.
create or replace function public.create_workspace_with_owner(
  workspace_name text,
  workspace_slug text
)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace public.workspaces;
begin
  insert into public.workspaces (name, slug, created_by)
  values (workspace_name, workspace_slug, auth.uid())
  returning * into new_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace.id, auth.uid(), 'owner');

  return new_workspace;
end;
$$;

revoke all on function public.create_workspace_with_owner(text, text) from public;
grant execute on function public.create_workspace_with_owner(text, text) to authenticated;
