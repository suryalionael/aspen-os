-- Sprint 3 Phase M: workspace logo, description, default timezone, and a
-- danger zone (archive/delete). Mirrors the avatars bucket (DEC-024) for
-- the logo and the project archive pattern (migration 019) for soft
-- delete via filtering.

alter table public.workspaces
  add column description text,
  add column logo_url text,
  add column default_timezone text,
  add column archived_at timestamptz;

-- General field edits (name/description/logo/timezone) move from "any
-- member" to admin+owner, matching DEC-026's framing that workspace-level
-- management sits alongside project management, not plain "work".
drop policy "Members can update their workspaces" on public.workspaces;
create policy "Admins and owners can update their workspaces"
  on public.workspaces for update to authenticated
  using (public.is_workspace_admin_or_owner(id));

-- Archiving and deleting are more destructive than a field edit and stay
-- owner-only, funneled through dedicated RPCs (same reasoning as
-- change_member_role/transfer_workspace_ownership, migration 023) rather
-- than relying on RLS to distinguish "which columns changed" within a
-- single UPDATE policy, which Postgres RLS can't express directly.
create function public.archive_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception 'Only the workspace owner can archive this workspace.';
  end if;
  update public.workspaces set archived_at = now() where id = p_workspace_id;
end;
$$;

create function public.unarchive_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception 'Only the workspace owner can restore this workspace.';
  end if;
  update public.workspaces set archived_at = null where id = p_workspace_id;
end;
$$;

revoke all on function public.archive_workspace(uuid) from public;
revoke all on function public.unarchive_workspace(uuid) from public;
grant execute on function public.archive_workspace(uuid) to authenticated;
grant execute on function public.unarchive_workspace(uuid) to authenticated;

-- No existing DELETE policy on workspaces at all until now — deleting a
-- workspace cascades to every project/task/etc. beneath it (existing FKs),
-- so this is the single most destructive action in the schema and stays
-- owner-only.
create policy "Owners can delete their workspaces"
  on public.workspaces for delete to authenticated
  using (public.is_workspace_owner(id));

insert into storage.buckets (id, name, public)
values ('workspace-logos', 'workspace-logos', true);

create policy "Workspace logos are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'workspace-logos');

create policy "Admins and owners can upload workspace logos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'workspace-logos'
    and public.is_workspace_admin_or_owner(((storage.foldername(name))[1])::uuid)
  );

create policy "Admins and owners can replace workspace logos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'workspace-logos'
    and public.is_workspace_admin_or_owner(((storage.foldername(name))[1])::uuid)
  );

create policy "Admins and owners can delete workspace logos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'workspace-logos'
    and public.is_workspace_admin_or_owner(((storage.foldername(name))[1])::uuid)
  );
