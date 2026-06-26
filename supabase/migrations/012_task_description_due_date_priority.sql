-- Phase A2: description, due date, and priority are simple scalar
-- additions to tasks, edited together in the same detail-dialog form as
-- the title (DEC-015 governs creation, not editing — this is a separate
-- surface introduced in migration 010/DEC-021).
alter table public.tasks
  add column description text null,
  add column due_date date null,
  -- Small, fixed set, same reasoning as DEC-003's tasks.status check
  -- constraint — unlike task_activity.event_type, priority is not
  -- expected to grow, so a check constraint (not a lookup table) is the
  -- consistent choice here.
  add column priority text null
    check (priority in ('low', 'medium', 'high', 'urgent'));
