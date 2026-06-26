-- Phase A4: a single implicit checklist per task (not Trello's multiple
-- named checklists per card) — consistent with "opinionated over
-- configurable" and keeps the schema/UI to one concept. Reuses
-- is_workspace_member_for_task directly, same as labels/task_activity.
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  content text not null,
  completed boolean not null default false,
  position numeric not null,
  created_at timestamptz not null default now()
);

create index checklist_items_task_id_position_idx
  on public.checklist_items (task_id, position);

alter table public.checklist_items enable row level security;

create policy "Members can view checklist items"
  on public.checklist_items for select to authenticated
  using (public.is_workspace_member_for_task(task_id));

create policy "Members can create checklist items"
  on public.checklist_items for insert to authenticated
  with check (public.is_workspace_member_for_task(task_id));

create policy "Members can update checklist items"
  on public.checklist_items for update to authenticated
  using (public.is_workspace_member_for_task(task_id));

create policy "Members can delete checklist items"
  on public.checklist_items for delete to authenticated
  using (public.is_workspace_member_for_task(task_id));

grant select, insert, update, delete on public.checklist_items to authenticated;
