-- Sprint 3 Phase N: a complete, workspace-wide audit log. task_activity
-- (DEC-021) already covers most per-task events, but two things it
-- structurally can't do: survive the task being deleted (its FK cascades
-- away with the task — by design, per DEC-021, since it's meant as a
-- per-task history, not a tenant-wide record), and cover non-task events
-- (project rename, workspace rename, invitations, role changes). This
-- table is the superset: workspace-scoped, target-agnostic (a
-- denormalized target_label instead of a foreign key, so it survives the
-- target itself being deleted), and is what every existing mutation site
-- additionally writes to alongside task_activity (not instead of it —
-- the per-task panel still reads task_activity directly).
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- SET NULL, not CASCADE — mirrors task_activity.actor_id (migration
  -- 010): deleting a user's account anonymizes who did something, it
  -- doesn't erase the record that it happened.
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_label text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_workspace_id_created_at_idx
  on public.audit_log (workspace_id, created_at desc);
create index audit_log_workspace_id_actor_id_idx
  on public.audit_log (workspace_id, actor_id);
create index audit_log_workspace_id_action_idx
  on public.audit_log (workspace_id, action);

alter table public.audit_log enable row level security;

create policy "Members can view their workspace's audit log"
  on public.audit_log for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can write audit log entries for their workspace"
  on public.audit_log for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

-- No update/delete policy or grant — an audit log is immutable once
-- written, the same posture as task_activity.
grant select, insert on public.audit_log to authenticated;
