-- The "Remove member" UI needs to show who each member actually is.
-- auth.users isn't exposed via RLS/PostgREST directly, so this RPC joins
-- it server-side and authorizes internally (checks workspace membership
-- itself, since the caller hasn't already been authorized by a table
-- RLS policy the way a normal SELECT would be).
create function public.get_workspace_members_with_email(p_workspace_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  joined_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select wm.user_id, u.email, wm.role, wm.created_at
  from public.workspace_members wm
  join auth.users u on u.id = wm.user_id
  where wm.workspace_id = p_workspace_id
    and public.is_workspace_member(p_workspace_id)
  order by wm.created_at asc;
$$;

revoke all on function public.get_workspace_members_with_email(uuid) from public;
grant execute on function public.get_workspace_members_with_email(uuid) to authenticated;
