-- Sprint 2 Phase H: file attachments on tasks. Unlike avatars (migration
-- 021, public bucket — meant to be shown to anyone), task content is
-- private to workspace members, so this bucket has no public-read policy;
-- every read goes through a signed URL generated server-side after the
-- same is_workspace_member_for_task(uuid) check (migration 010) used by
-- comments/checklist/labels.
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false);

-- Path convention: "<task_id>/<uuid>-<filename>" — unlike avatars (one
-- fixed path per user), a task can have many attachments, so each upload
-- needs its own unique path rather than overwriting the last one.
create policy "Members can view task attachment files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'task-attachments'
    and public.is_workspace_member_for_task(((storage.foldername(name))[1])::uuid)
  );

create policy "Members can upload task attachment files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-attachments'
    and public.is_workspace_member_for_task(((storage.foldername(name))[1])::uuid)
  );

create policy "Members can delete task attachment files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-attachments'
    and public.is_workspace_member_for_task(((storage.foldername(name))[1])::uuid)
  );

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  -- SET NULL, not CASCADE — mirrors task_activity.actor_id (migration
  -- 010): deleting a user's account anonymizes who uploaded a file, it
  -- doesn't delete the file itself, which the rest of the team may still
  -- need.
  uploaded_by uuid references auth.users(id) on delete set null,
  file_name text not null,
  file_path text not null,
  file_size bigint not null,
  content_type text,
  created_at timestamptz not null default now()
);

create index task_attachments_task_id_idx on public.task_attachments (task_id);

alter table public.task_attachments enable row level security;

create policy "Members can view task attachment metadata"
  on public.task_attachments for select to authenticated
  using (public.is_workspace_member_for_task(task_id));

create policy "Members can insert task attachment metadata"
  on public.task_attachments for insert to authenticated
  with check (public.is_workspace_member_for_task(task_id));

create policy "Members can delete task attachment metadata"
  on public.task_attachments for delete to authenticated
  using (public.is_workspace_member_for_task(task_id));

-- No update policy/grant: an attachment is replaced by deleting and
-- re-uploading, not edited in place — same immutable-record posture as
-- task_activity.
grant select, insert, delete on public.task_attachments to authenticated;
