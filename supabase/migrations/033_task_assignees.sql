-- Sprint 4 Priority 9: multiple assignees per task. Mirrors task_labels
-- (migration 013) exactly - same join-table shape, same RLS approach
-- reusing is_workspace_member_for_task, for the same reason: a task's
-- assignees are workspace members, gated by task-level membership, not a
-- new permission concept.
--
-- tasks.assignee_id (single, nullable) is left in place rather than
-- dropped - every existing read path (notifications, the dashboard's
-- "assigned to you" widget, board sort-by-assignee, the calendar) already
-- depends on it, and rewriting all of those is out of scope for this
-- priority. It now means "primary assignee" and is kept in sync by the
-- assign/unassign actions: set when the first assignee is added, cleared
-- or reassigned to a remaining assignee when removed.
create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_assignees_user_id_idx on public.task_assignees (user_id);

alter table public.task_assignees enable row level security;

create policy "Members can view task assignees"
  on public.task_assignees for select to authenticated
  using (public.is_workspace_member_for_task(task_id));

create policy "Members can assign task assignees"
  on public.task_assignees for insert to authenticated
  with check (public.is_workspace_member_for_task(task_id));

create policy "Members can unassign task assignees"
  on public.task_assignees for delete to authenticated
  using (public.is_workspace_member_for_task(task_id));

grant select, insert, delete on public.task_assignees to authenticated;
