-- Phase E: no table was in the supabase_realtime publication before this
-- (confirmed via pg_publication_tables — empty result), so Realtime
-- subscriptions for tasks and comments would otherwise silently receive
-- no events at all rather than failing loudly.
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.comments;
