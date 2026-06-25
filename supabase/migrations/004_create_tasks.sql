create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  -- DEC-003: status is a constrained column, not a separate task_status
  -- table — the four values are fixed and not user-configurable in Sprint 1.
  status text not null default 'todo'
    check (status in ('backlog', 'todo', 'in_progress', 'done')),
  position numeric not null,
  -- DEC-013: `assignee_id` is retained but unused by any Sprint 1 UI,
  -- reserved for the Sprint 2 "My Tasks" feature. See DECISION-LOG.md DEC-013.
  assignee_id uuid references auth.users (id),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
