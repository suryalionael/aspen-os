-- Sprint 4 Priority 13 ("Heart & Hub"): one unified notes entity instead of
-- separate Document/Quick Note/Meeting Note/Announcement tables — they're
-- the same shape (title + body, workspace-scoped, optionally tied to a
-- project), differing only in a "type" tag used for filtering. Announcements
-- are a thin wrapper: creating a note with type='announcement' additionally
-- writes to the existing audit_log (see lib/actions/notes.ts), reusing the
-- workspace's existing activity feed instead of inventing a new one.
--
-- Workspace-scoped RLS mirrors meetings (migration 034): is_workspace_member
-- directly, since notes aren't owned by a deeper entity the way task_labels/
-- task_assignees are owned by a task.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  type text not null default 'quick_note'
    check (type in ('document', 'quick_note', 'meeting_note', 'announcement')),
  title text not null,
  body text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_workspace_id_idx on public.notes(workspace_id);
create index notes_project_id_idx on public.notes(project_id);

alter table public.notes enable row level security;

create policy "Members can view notes"
  on public.notes for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can create notes"
  on public.notes for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy "Members can update notes"
  on public.notes for update to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can delete notes"
  on public.notes for delete to authenticated
  using (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.notes to authenticated;
