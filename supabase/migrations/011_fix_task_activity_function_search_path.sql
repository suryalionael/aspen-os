-- Matches the hardening pattern used by is_workspace_member and
-- is_workspace_member_for_project in migration 007, which migration 010
-- omitted by oversight (caught by get_advisors immediately after applying it).
create or replace function public.is_workspace_member_for_task(p_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    join public.workspace_members wm on wm.workspace_id = p.workspace_id
    where t.id = p_task_id
      and wm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_member_for_task(uuid) from public;
