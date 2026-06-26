-- Phase C resolves DEC-011 (no invite flow in Sprint 1) and makes
-- DEC-012's workspace_members.role load-bearing for the first time, per
-- that decision's own revisit condition: "add the corresponding RLS
-- policy and UI together."

create function public.is_workspace_owner(p_workspace_id uuid)
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
      and role = 'owner'
  );
$$;

revoke all on function public.is_workspace_owner(uuid) from public;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

create index workspace_invites_workspace_id_idx
  on public.workspace_invites (workspace_id);

alter table public.workspace_invites enable row level security;

create policy "Members can view their workspace's invites"
  on public.workspace_invites for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Owners can create invites"
  on public.workspace_invites for insert to authenticated
  with check (
    public.is_workspace_owner(workspace_id)
    and created_by = auth.uid()
  );

create policy "Owners can revoke invites"
  on public.workspace_invites for update to authenticated
  using (public.is_workspace_owner(workspace_id));

grant select, insert, update on public.workspace_invites to authenticated;

-- The invitee isn't a member yet, so they cannot read workspace_invites
-- directly under the policy above — these two functions are the only
-- way to look up or redeem a token, both running as SECURITY DEFINER to
-- bypass that intentionally, the same pattern as create_workspace_with_owner.

create function public.get_invite_workspace_name(p_token text)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select w.name
  from public.workspace_invites wi
  join public.workspaces w on w.id = wi.workspace_id
  where wi.token = p_token
    and wi.revoked_at is null;
$$;

revoke all on function public.get_invite_workspace_name(text) from public;
grant execute on function public.get_invite_workspace_name(text) to authenticated, anon;

create function public.join_workspace_via_invite(p_token text)
returns public.workspace_members
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

  return v_result;
end;
$$;

revoke all on function public.join_workspace_via_invite(text) from public;
grant execute on function public.join_workspace_via_invite(text) to authenticated;

-- DEC-010/011 deliberately left workspace_members with no write policies
-- at all. This adds the first one: a member may remove themselves
-- (leave), and an owner may remove anyone (including other owners) —
-- but a non-owner member may never remove a different member, which
-- this single USING clause already enforces.
create policy "Owners can remove members, members can leave"
  on public.workspace_members for delete to authenticated
  using (
    public.is_workspace_owner(workspace_id)
    or user_id = auth.uid()
  );

grant delete on public.workspace_members to authenticated;
