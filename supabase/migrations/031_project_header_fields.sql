-- Sprint 4 Priority 3: rich project header needs a description, an
-- optional due date, and a lightweight status distinct from archived_at
-- (archived_at is a lifecycle/visibility flag - status is a point-in-time
-- health indicator a team sets manually, e.g. to flag "on hold").
alter table public.projects
  add column if not exists description text,
  add column if not exists due_date date,
  add column if not exists status text not null default 'active';

alter table public.projects
  add constraint projects_status_check
  check (status in ('active', 'on_hold', 'completed'));

-- No RLS/grant changes needed: "Admins and owners can update projects"
-- (migration 023) is a row-level policy with no column list, so it
-- already covers these new columns.
