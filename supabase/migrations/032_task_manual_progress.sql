-- Sprint 4 Priority 8: a task's own progress is checklist-completion when
-- a checklist exists, otherwise a manually-set percentage - this column
-- is the manual fallback, read by the client only when checklistTotal=0.
alter table public.tasks
  add column if not exists progress smallint not null default 0;

alter table public.tasks
  add constraint tasks_progress_check check (progress between 0 and 100);

-- No RLS/grant changes: "Members can update tasks..." policies already
-- in place from migration 004/007 are row-level with no column list.
