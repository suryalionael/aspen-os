-- DEC-006 explicitly flagged that the moment a task-edit feature ships,
-- tasks.updated_at stops being a clean proxy for "task moved" and a
-- dedicated event-tracking mechanism becomes necessary. Sprint 2 ships
-- both task editing and an explicit Activity Log feature, so this
-- migration resolves DEC-006 by introducing a dedicated event table
-- rather than continuing to overload updated_at.

alter table public.tasks
  add column archived_at timestamptz null;

create table public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  -- SET NULL (not CASCADE): an activity entry belongs to the task's
  -- history, not to the actor who caused it. Deleting a user's account
  -- should not erase the record that a task was edited/moved/archived —
  -- only anonymize who did it. This intentionally differs from the
  -- created_by CASCADE pattern used on workspaces/projects/tasks, where
  -- the row itself is owned by its creator.
  actor_id uuid references auth.users(id) on delete set null,
  -- Left as unconstrained text rather than a check constraint (contrast
  -- with DEC-003's tasks.status): event types will keep growing across
  -- Sprint 2 phases (moved, edited, archived, unarchived, commented,
  -- label_added, checklist_item_completed, ...), unlike status's small
  -- fixed set, so a check constraint would mean a migration per phase.
  event_type text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index task_activity_task_id_created_at_idx
  on public.task_activity (task_id, created_at);

-- Mirrors is_workspace_member_for_project's pattern (migration 007) for
-- tables keyed by task_id instead of project_id directly. Sprint 2's
-- comments, labels, and checklist_items tables will reuse this same
-- helper, per the established RLS extension pattern.
create function public.is_workspace_member_for_task(p_task_id uuid)
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

alter table public.task_activity enable row level security;

create policy "Members can view task activity"
  on public.task_activity
  for select
  to authenticated
  using (public.is_workspace_member_for_task(task_id));

create policy "Members can insert task activity"
  on public.task_activity
  for insert
  to authenticated
  with check (public.is_workspace_member_for_task(task_id));

-- No update/delete policy or grant: activity entries are immutable once
-- written, the same audit-log assumption DEC-006's revisit note implied.
grant select, insert on public.task_activity to authenticated;
