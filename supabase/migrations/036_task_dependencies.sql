-- Sprint 6: task dependencies — a task can be blocked by other tasks.
-- dependent_task_id IS BLOCKED BY dependency_task_id.
-- Both are in the same workspace (enforced via project → workspace chain in RLS).
-- CASCADE on delete: removing a task removes all its blocking/blocked-by edges.

create table public.task_dependencies (
  dependent_task_id uuid not null references public.tasks(id) on delete cascade,
  dependency_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (dependent_task_id, dependency_task_id),
  -- A task cannot block itself.
  constraint no_self_dependency check (dependent_task_id <> dependency_task_id)
);

create index task_dependencies_dependency_idx on public.task_dependencies(dependency_task_id);

alter table public.task_dependencies enable row level security;

create policy "Members can view task dependencies"
  on public.task_dependencies for select to authenticated
  using (public.is_workspace_member_for_task(dependent_task_id));

create policy "Members can add task dependencies"
  on public.task_dependencies for insert to authenticated
  with check (public.is_workspace_member_for_task(dependent_task_id));

create policy "Members can remove task dependencies"
  on public.task_dependencies for delete to authenticated
  using (public.is_workspace_member_for_task(dependent_task_id));

grant select, insert, delete on public.task_dependencies to authenticated;
