-- Sprint 3 Phase I: a three-tier role system (owner/admin/member) and
-- email-tagged, acceptable/declinable invites, replacing the Sprint 2
-- owner/member-only model (DEC-022).

alter table public.workspace_members
  drop constraint workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check check (role in ('owner', 'admin', 'member'));

-- Mirrors is_workspace_owner's shape (migration 017) — admin and owner
-- share every permission except member removal, role changes, ownership
-- transfer, and workspace deletion, which stay owner-only per the Phase I
-- spec ("Owner: everything").
create function public.is_workspace_admin_or_owner(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_workspace_admin_or_owner(uuid) from public;
grant execute on function public.is_workspace_admin_or_owner(uuid) to authenticated;

-- Projects: Sprint 2 let any member manage projects (migration 003/019).
-- Phase I's "Member: work only" means project lifecycle management
-- (create/rename/archive/delete) becomes admin+owner only; members keep
-- full task-level work via the unchanged tasks policies.
drop policy "Members can create projects in their workspaces" on public.projects;
create policy "Admins and owners can create projects"
  on public.projects for insert to authenticated
  with check (public.is_workspace_admin_or_owner(workspace_id));

drop policy "Members can update projects in their workspaces" on public.projects;
create policy "Admins and owners can update projects"
  on public.projects for update to authenticated
  using (public.is_workspace_admin_or_owner(workspace_id));

drop policy "Members can delete projects in their workspaces" on public.projects;
create policy "Admins and owners can delete projects"
  on public.projects for delete to authenticated
  using (public.is_workspace_admin_or_owner(workspace_id));

-- Invites: "invite members" is an explicit admin permission in Phase I,
-- widening DEC-022's owner-only invite creation/revocation.
drop policy "Owners can create invites" on public.workspace_invites;
create policy "Admins and owners can create invites"
  on public.workspace_invites for insert to authenticated
  with check (public.is_workspace_admin_or_owner(workspace_id) and created_by = auth.uid());

drop policy "Owners can revoke invites" on public.workspace_invites;
create policy "Admins and owners can revoke invites"
  on public.workspace_invites for update to authenticated
  using (public.is_workspace_admin_or_owner(workspace_id));

-- invited_email is metadata only (no transactional email provider is
-- configured in this stack — see DEC-022's original rationale, reaffirmed
-- for Phase I): it lets the inviter track who a link/invite was meant
-- for, displayed in a "Pending invitations" list, but the inviter still
-- shares the link manually. accepted_at/declined_at let that same list
-- show each invite's real status instead of just "active or revoked".
alter table public.workspace_invites
  add column invited_email text,
  add column accepted_at timestamptz,
  add column declined_at timestamptz;

create or replace function public.join_workspace_via_invite(p_token text)
returns workspace_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_result public.workspace_members;
begin
  select wi.workspace_id into v_workspace_id
  from public.workspace_invites wi
  where wi.token = p_token
    and wi.revoked_at is null;

  if v_workspace_id is null then
    raise exception 'Invalid or revoked invite link.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, auth.uid(), 'member')
  on conflict (workspace_id, user_id) do nothing
  returning * into v_result;

  if v_result.id is null then
    select * into v_result
    from public.workspace_members
    where workspace_id = v_workspace_id and user_id = auth.uid();
  end if;

  -- Informational only — the link itself stays reusable (DEC-022), this
  -- just lets the inviter's "Pending invitations" list show it was used.
  update public.workspace_invites
    set accepted_at = now()
    where token = p_token and accepted_at is null;

  return v_result;
end;
$$;

-- Lets an invitee explicitly decline before signing up/in counts as
-- membership — callable by anon too, same as get_invite_workspace_name,
-- since declining shouldn't require an account.
create function public.decline_workspace_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workspace_invites
    set declined_at = now()
    where token = p_token and revoked_at is null and accepted_at is null;
end;
$$;

revoke all on function public.decline_workspace_invite(text) from public;
grant execute on function public.decline_workspace_invite(text) to authenticated, anon;

-- Role changes and ownership transfer are funneled through these two
-- RPCs rather than a generic UPDATE policy on workspace_members, so a
-- workspace can never end up with zero or multiple owners and a caller
-- can never promote themselves.
create function public.change_member_role(p_workspace_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role.';
  end if;
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception 'Only the workspace owner can change member roles.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use transfer_workspace_ownership to change your own role.';
  end if;

  update public.workspace_members
    set role = p_role
    where workspace_id = p_workspace_id and user_id = p_user_id and role <> 'owner';
end;
$$;

revoke all on function public.change_member_role(uuid, uuid, text) from public;
grant execute on function public.change_member_role(uuid, uuid, text) to authenticated;

create function public.transfer_workspace_ownership(p_workspace_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception 'Only the current owner can transfer ownership.';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_new_owner_id
  ) then
    raise exception 'The new owner must already be a member of this workspace.';
  end if;

  update public.workspace_members set role = 'admin'
    where workspace_id = p_workspace_id and user_id = auth.uid();
  update public.workspace_members set role = 'owner'
    where workspace_id = p_workspace_id and user_id = p_new_owner_id;
end;
$$;

revoke all on function public.transfer_workspace_ownership(uuid, uuid) from public;
grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated;
