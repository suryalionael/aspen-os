-- Sprint 2 Phase G: avatar uploads. Bio/theme/timezone/notification
-- preferences live in auth.users.user_metadata (no table needed — they're
-- private, single-row-per-user, and never queried across users), but an
-- avatar is a binary file, which needs actual Storage. Public bucket
-- because avatars are rendered as plain <img> tags throughout the app
-- (e.g. a future members facepile) without per-request signed URLs.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

-- Path convention enforced by these policies: "<user_id>/avatar.<ext>" —
-- (storage.foldername(name))[1] is the first path segment, so this scopes
-- every write to objects under the caller's own id, mirroring the
-- ownership checks used everywhere else in this schema.
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can replace their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
