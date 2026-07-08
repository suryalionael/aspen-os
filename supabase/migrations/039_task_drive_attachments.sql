-- Sprint 5 Phase 4: Drive attachments for tasks.
-- Add optional Drive file fields to task_attachments.
-- When drive_file_id is populated, it's a Drive attachment;
-- when file_path is populated, it's a local upload.
-- Both can be null (transitional state), but at least one should be set.
alter table public.task_attachments
  add column if not exists drive_file_id text,
  add column if not exists drive_url text,
  add column if not exists thumbnail text,
  add column if not exists drive_owner_email text,
  add column if not exists drive_owner_name text,
  add column if not exists drive_modified_time timestamptz;

-- Index for looking up attachments by Drive file ID
create index if not exists task_attachments_drive_file_id_idx on public.task_attachments (drive_file_id);
