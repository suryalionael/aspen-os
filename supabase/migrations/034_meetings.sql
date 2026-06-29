-- Priority 12: workspace calendar — meetings are workspace-scoped (optionally
-- linked to a project), mirroring task_labels/task_assignees' join-table RLS
-- pattern but rooted at is_workspace_member instead of is_workspace_member_for_task.

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_workspace_id_idx on public.meetings(workspace_id);
create index if not exists meetings_project_id_idx on public.meetings(project_id);

create table if not exists public.meeting_attendees (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;

create function public.is_workspace_member_for_meeting(p_meeting_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.meetings m
    join public.workspace_members wm on wm.workspace_id = m.workspace_id
    where m.id = p_meeting_id
      and wm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_member_for_meeting(uuid) from public;
grant execute on function public.is_workspace_member_for_meeting(uuid) to authenticated;

create policy "Members can view meetings"
  on public.meetings for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can create meetings"
  on public.meetings for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy "Members can update meetings"
  on public.meetings for update to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can delete meetings"
  on public.meetings for delete to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can view meeting attendees"
  on public.meeting_attendees for select to authenticated
  using (public.is_workspace_member_for_meeting(meeting_id));

create policy "Members can add meeting attendees"
  on public.meeting_attendees for insert to authenticated
  with check (public.is_workspace_member_for_meeting(meeting_id));

create policy "Members can remove meeting attendees"
  on public.meeting_attendees for delete to authenticated
  using (public.is_workspace_member_for_meeting(meeting_id));

grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert, delete on public.meeting_attendees to authenticated;
