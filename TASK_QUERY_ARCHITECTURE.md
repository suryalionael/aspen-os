# Task Query Architecture

**Optimization C**: Replace 4 parallel tasks queries + 1 task_assignees join query with 1 broader query + in-memory filtering.

## Status: **REVERTED** — improvement under 50ms threshold

## Why It Was Tested

The dashboard performs 5 queries hitting the `tasks` and `task_assignees` tables in parallel (batch 1):

| # | Table | Filter | Limit | ~Duration |
|---|---|---|---|---|
| ① | tasks | assignee_id = userId, status ≠ done, archived = null | 10 | 57ms |
| ② | task_assignees | tasks!inner, user_id = userId | ∞ | 65ms |
| ③ | tasks | due_date = today, status ≠ done, archived = null | 10 | 46ms |
| ④ | tasks | due_date (today, +7d], status ≠ done, archived = null | 10 | 39ms |
| ⑥ | tasks | (none — all tasks for ID mapping) | ∞ | 42ms |

These run in parallel via `Promise.all`. Batch 2 (task_activity + RPC) runs after batch 1 resolves.

The hypothesis: replacing 5 queries with 1 would reduce connection pool contention and round-trip overhead.

## What Was Implemented

```typescript
// Single merged query
supabase
  .from("tasks")
  .select("id, title, project_id, due_date, priority, status, assignee_id, created_at, archived_at, task_assignees(user_id)")
  .in("project_id", projectIds)

// In-memory filtering
const assigned = allTasks.filter(t => !t.archived_at && t.status !== "done" &&
  (t.assignee_id === userId || t.task_assignees?.some(a => a.user_id === userId)))
const dueToday = allTasks.filter(t => t.due_date === today && ...)
const upcoming = allTasks.filter(t => t.due_date > today && t.due_date <= weekAhead && ...)
const taskById = new Map(allTasks.map(t => [t.id, { title: t.title, project_id: t.project_id }]))
```

## Measured Improvement

| Metric | Before | After | Delta |
|---|---|---|---|
| Batch 1 queries | 5 parallel | 1 merged (+ 3 non-tasks) | -4 queries |
| Batch 1 wall-clock (max) | ~65ms (task_assignees) | ~60-70ms (merged, more columns) | ~0ms |
| Round-trips saved | — | 4 eliminated | ~15ms at best |
| Data transferred | Filtered subsets (10 rows each + all IDs) | All tasks + nested assignees | **More data** |

The bottleneck for the dashboard render is **not** the parallel batch 1 queries. The streaming gap is dominated by batch 2 (task_activity ~200ms + RPC ~46ms). Reducing 5 parallel queries to 1 saved at most ~15ms — well under the 50ms threshold.

## Why the Merged Query Did Not Help

1. The parallel queries already overlap — total wall-clock time is `max(①, ②, ③, ④, ⑤, ⑥, ⑦, ⑧)` = ~65ms
2. The merged query returns more columns and performs a lateral join on `task_assignees`, taking at least as long as the old slowest query
3. The merged query returns ALL tasks (including archived/done) instead of filtered subsets — more network data, more JSON parsing
4. The sequential batch 2 is the real bottleneck, not batch 1

## Recommendation

The parallel query architecture is appropriate for this use case. Each filtered query returns exactly the data needed for a specific card, keeping payload size minimal. The Supabase connection pool on a free plan handles 8 parallel queries without issue.

If further dashboard optimization is desired, the target should be:
- The **task_activity** query in batch 2 (~200ms) — converting it from a sequential query to parallel within batch 1 would require knowing the task IDs ahead of time, which is not possible without the projects query
- Or eliminating the batch 1 → batch 2 sequential dependency entirely by restructuring the data flow
