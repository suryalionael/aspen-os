-- checkDueTodayNotifications() previously relied on a check-then-insert
-- ("does a due_today notification already exist for this task?") which is
-- inherently racy under concurrent calls (confirmed directly: React
-- StrictMode's deliberate double-invoked effects produced two identical
-- due_today rows for the same task in the same load). A database-level
-- constraint is the only way to make this actually safe.
--
-- Scoped to type = 'due_today' only via a partial index — notify once per
-- (user, task) ever, not once per calendar day; if a task's due date is
-- changed and later circles back to "today" again, intentionally not
-- re-notifying is a reasonable simplification (avoids notification spam)
-- rather than an oversight.
create unique index notifications_due_today_once_idx
  on public.notifications (user_id, task_id)
  where type = 'due_today';
