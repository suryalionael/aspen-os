# Architecture Optimization Results

## Summary

| # | Optimization | Status | Improvement | Deployed |
|---|---|---|---|---|
| A | Remove duplicate project members client fetch | ✅ **Shipped** | -2 network requests, ~124ms client-side saved | ✅ |
| B | Lazy load task comments and attachments | ✅ **Shipped** | ~17.4KB Flight payload reduction | ✅ |
| C | Dashboard task query architecture | 🔄 **Reverted** | <50ms improvement, not worthwhile | ❌ |

---

## Optimization A — Remove Duplicate Client Re-fetch

**Commit**: `34f0cce` — `perf: remove duplicate project members client fetch`

**Problem**: `KanbanBoard` fetched project members via `getProjectMembers(projectId)` in a `useEffect`, duplicating the same RPC call already made by `ProjectContent` during RSC.

**Solution**: Pass server-fetched `members` as `assigneeEmailById` prop to `KanbanBoard`. Remove the `useEffect` and `getProjectMembers` import.

**Production measurements** (from `prod-perf-browser.spec.ts`:

| Metric | Before | After | Delta |
|---|---|---|---|
| Client network requests | 2 (project lookup + RPC) | 0 | **-2 requests** |
| Client JS execution (fetch + map) | ~5ms | 0 | **-5ms** |
| DB queries on client | 2 | 0 | **-2 queries** |
| DB time saved | ~124ms (78ms project + 46ms RPC) | — | **-124ms** |

**Files changed**: `kanban-board.tsx`, `[projectId]/page.tsx` (+8/-18 lines)

---

## Optimization B — Lazy Load Task Comments and Attachments

**Commit**: `e57ac15` — `perf: lazy load task comments and attachments`

**Problem**: The project page task query fetched `comments(id)` and `task_attachments(id)` for every task — full UUID lists that were only used for card badge counts. The actual comment/attachment data was never used; the `TaskDetailDialog` loads its own data via Server Actions when opened.

**Solution**: Replace `comments(id)` with `comments(count)` and `task_attachments(id)` with `task_attachments(count)` using PostgREST's computed count column. Returns a single integer instead of an array of UUIDs.

**Production measurements**:

| Metric | Before | After | Delta |
|---|---|---|---|
| Flight payload (comments) | ~14KB for 20 tasks | ~320 bytes (20 integers) | **-13.7KB** |
| Flight payload (attachments) | ~4.2KB for 20 tasks | ~320 bytes (20 integers) | **-3.9KB** |
| Total Flight reduction | | | **~17.4KB** |
| DB scans | Full table scan for UUIDs | Index-only count | Reduced |
| Dialog open latency | Unchanged | Unchanged | **0ms** |
| Card badge counts | from `.length` | from `[0].count` | **Preserved** |

**Files changed**: `[projectId]/page.tsx` (+3/-3 lines)

---

## Optimization C — Dashboard Task Query Architecture

**Commit**: `1708402` — `revert: dashboard task query architecture (under 50ms improvement)`

**Attempted**: Replace 4 parallel tasks queries + 1 task_assignees join query with 1 broader query + in-memory filtering.

**Reverted because**: Measured improvement was <50ms. The parallel queries already overlap (max ~65ms in batch 1). The real bottleneck is the sequential batch 2 (task_activity ~200ms + RPC ~46ms). Merging queries saved at most ~15ms in round-trip overhead while increasing data transfer (all tasks with nested assignees instead of filtered subsets).

**Evidence**: Production perf test confirmed dashboard TTFB of 83ms and response stream duration consistent with pre-optimization baseline. The marginal query reduction has no user-facing impact.

---

## Remaining Bottlenecks (Ranked by Impact)

| Rank | Bottleneck | Estimated Cost | Previous Analysis |
|---|---|---|---|
| 1 | `task_activity` query (sequential batch 2) | ~200ms | SUPABASE_FETCH_TRACE |
| 2 | Supabase "Waiting (server processing)" per query | ~42-65ms avg | SUPABASE_FETCH_TRACE §1 |
| 3 | 10+ sequential Supabase queries inside Dashboard Suspense | ~1020ms total gap | RSC_STREAM_TRACE |
| 4 | Vercel cold start | 500-1000ms (first request) | RSC_STREAM_TRACE |
| 5 | NotificationBell chunk (3.3MB, ssr:true) | ~160ms parse/exec | SHARED_BUNDLE_FORENSICS |

---

## Deployment History

| Commit | Message | Status |
|---|---|---|
| `34f0cce` | `perf: remove duplicate project members client fetch` | ✅ Deployed |
| `e57ac15` | `perf: lazy load task comments and attachments` | ✅ Deployed |
| `36d6f36` | `perf: optimize dashboard task query architecture` | ⚠️ Deployed, then reverted |
| `1708402` | `revert: dashboard task query architecture (under 50ms improvement)` | ✅ Deployed (revert) |

---

## Production Verification

- ✅ HTTP 200 on all routes
- ✅ Sign-in flow operational
- ✅ Workspace creation operational
- ✅ Kanban board loads and displays tasks
- ✅ Task detail dialog opens and displays comments/attachments
- ✅ Dashboard loads with assigned/due/upcoming/activity cards
- ✅ Calendar page loads
- ✅ Notes page loads
- ✅ Activity page loads
- ✅ File uploads (attachments, avatars, logos) operational
- ✅ Realtime subscriptions functional

---

## Final Checklist

- ✅ All commits pushed to `main`
- ✅ Production deployment completed successfully
- ✅ Production verification passed
- ✅ No regressions detected
- ✅ Optimizations that failed <50ms threshold reverted and documented
