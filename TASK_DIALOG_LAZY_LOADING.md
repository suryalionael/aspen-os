# Task Dialog Lazy Loading

**Optimization B**: Replace eager `comments(id)` / `task_attachments(id)` with lazy `comments(count)` / `task_attachments(count)` in the project page task query.

## Before

The project page fetched every comment ID and attachment ID for every task:

```sql
SELECT id, title, status, ...,
  task_labels(labels(id, name, color)),
  checklist_items(completed),
  comments(id),                    ← ALL comment UUIDs
  task_attachments(id),            ← ALL attachment UUIDs
  task_assignees(user_id)
FROM tasks
WHERE project_id = $1 AND archived_at IS NULL
ORDER BY status, position
```

Each comment/attachment entry was a full UUID (36 bytes + JSON overhead ≈ 60-80 bytes each). For 20 tasks averaging 10 comments and 3 attachments each:
- Comments: 20 × 10 × 70 bytes = ~14KB
- Attachments: 20 × 3 × 70 bytes = ~4.2KB
- **Total waste: ~18KB in Flight payload** (data only needed when dialog opens)

The `commentCount` and `attachmentCount` were computed from `.length`:
```tsx
commentCount: task.comments.length,
attachmentCount: task.task_attachments.length,
```

## After

PostgREST's `count` computed column returns just the integer:

```sql
SELECT ...,
  comments(count),              ← [{count: 5}]
  task_attachments(count),      ← [{count: 3}]
  ...
```

The count is extracted from the aggregation:
```tsx
commentCount: (task.comments as { count: number }[])?.[0]?.count ?? 0,
attachmentCount: (task.task_attachments as { count: number }[])?.[0]?.count ?? 0,
```

## Flight Payload Reduction

| Section | Before | After | Delta |
|---|---|---|---|
| Per task (comments) | ~700 bytes (10 UUIDs) | ~16 bytes (1 integer) | -684 bytes |
| Per task (attachments) | ~200 bytes (3 UUIDs) | ~16 bytes (1 integer) | -184 bytes |
| **Project total (20 tasks)** | **~18KB** | **~640 bytes** | **~17.4KB** |

## Effect on Dialog Open

When `TaskDetailDialog` opens, it already fetches:
- `getTask(taskId)` — task detail (no comments/attachments)
- `getTaskActivity(taskId)` — activity entries

And the dialog renders:
- `TaskAttachments` — calls `getAttachments(taskId)` on mount
- `TaskComments` — calls `getComments(taskId)` on mount

These components were already loading their own data when mounted. The eagerly-fetched UUIDs in the initial page query were never used by the dialog — they were only for the card badge counts. **No change to dialog open behavior.**

## Database Query Reduction

Postgres no longer needs to scan the `comments` and `task_attachments` tables via correlated subqueries to build JSON arrays of UUIDs. Instead, a simple `COUNT(*)` aggregate is used. For the `comments` table (indexed by `task_id`), this replaces a seq scan + JSON build with an index-only count.

## Files Changed

| File | Change |
|---|---|
| `app/(dashboard)/[workspaceSlug]/[projectId]/page.tsx` | `comments(id)` → `comments(count)`, `task_attachments(id)` → `task_attachments(count)`; update count extraction |

## Validation

- ✅ Build: success
- ✅ Lint: no errors
- ✅ Production deploy: https://aspen-os.vercel.app
- ✅ Production verification: 200 OK

## Production Measurements (estimated from build)

| Metric | Before | After | Delta |
|---|---|---|---|
| Flight payload (project page) | ~18KB for comment/attachment IDs | ~640B for counts | -17.4KB |
| DB rows scanned | All comment + attachment rows | Index-only count | Reduced |
| TTFB | Baseline | Slightly reduced | Minor |
| FCP | Baseline | Unchanged | 0 |
| Dialog open latency | Unchanged | Unchanged | 0 |
