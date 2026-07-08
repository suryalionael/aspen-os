# RSC Stream Trace

**Route**: Dashboard — `/v3-1783412840114`
**Environment**: Production (https://aspen-os.vercel.app)
**Method**: Node.js `fetch` + streaming `ReadableStream` reader
**Date**: 2026-07-07T08:27:41.809Z

## 1. Stream Summary

| Metric | Value |
|---|---|
| Total duration | 1025ms |
| Total bytes | 39773 (38.8 KB) |
| Network chunks | 7 |
| `__next_f.push` calls | 10 |
| Suspense boundaries | B:0 (sidebar), B:1 (DashboardContent) |
| Client-only boundaries | 1 (`BAILOUT_TO_CLIENT_SIDE_RENDERING`) |

## 2. Chunk Arrival Timeline

| # | Elapsed | Δ | Bytes | Phase |
|---|---|---|---|---|
| 0 | +2ms | — | 14870 | shell |
| 1 | +2ms | +0ms | 1514 | shell |
| 2 | +2ms | +0ms | 741 | shell |
| 3 | +2ms | +0ms | 15643 | shell |
| 4 | +2ms | +0ms | 1837 | shell |
| 5 | +1022ms | +1020ms | 3301 | content |
| 6 | +1025ms | +3ms | 1867 | content |

## 3. RSC Payload Timeline

| # | Elapsed | Type | Summary |
|---|---|---|---|
| 0 | +2ms | module_refs | Module references |
| 1 | +2ms | root_tree | Root RSC tree structure |
| 2 | +2ms | unknown | Segment d:[\"$\",\"div\",\"0\",{\"className\":\"h-7 animate-pulse ro... |
| 3 | +2ms | unknown | Segment 6:[\"$\",\"div\",null,{\"className\":\"flex min-h-screen fle... |
| 4 | +2ms | unknown | Segment 15:[[\"$\",\"meta\",\"0\",{\"charSet\":\"utf-8\"}],[\"$\",\"... |
| 5 | +2ms | unknown | Segment 1a:[\"$\",\"div\",null,{\"className\":\"flex items-center ga... |
| 6 | +2ms | module_refs | Module references |
| 7 | +2ms | page_heading | Page heading + action buttons |
| 8 | +2ms | sidebar_data | ProjectSidebar: workspace + projects data |
| 9 | +1022ms | dashboard_grid | DashboardContent grid resolved |

## 4. Streaming Waterfall

```
0ms                                  1025ms
──────────────────────────────────────────────────
TTFB / Layout shell                 =  +2ms
Server computing (queries)          ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  gap: 1020ms
DashboardContent flushes                                                    =  +1022ms
Stream ends                                                                 ■  +1025ms
──────────────────────────────────────────────────

Root tree                           ● +2ms
Page heading                        ● +2ms
Sidebar data resolved               ● +2ms
DashboardContent resolved                                                   ● +1022ms
```

## 5. What the Server Does During the 1020ms Gap

When the server enters Suspense boundary **B:1** (`DashboardContent`), it:

1. **Batch 1** (8 parallel Supabase queries):
   - `tasks` assigned to user (single assignee field) — filtered by user + project + status
   - `task_assignees` (multi-assignee join table)
   - `tasks` due today
   - `tasks` upcoming 7 days
   - `project_favorites`
   - `tasks` all IDs + titles (unbounded — all tasks in workspace projects)
   - `notes` (getWorkspaceNotes)
   - `meetings` today
2. **Merge** legacy single-assignee + multi-assignee task lists in memory
3. **Batch 2** (2 parallel queries, depends on Batch 1 task IDs):
   - `task_activity` last 10 (filtered by task IDs from Batch 1)
   - `workspace_members_with_email` RPC
4. **Render** the resolved React tree (card grid)
5. **Flush** `B:1` resolution chunk to client

## 6. Individual Supabase Query Latency

*Measured from macOS (not from Vercel edge). Actual server-to-Supabase latency will be lower.*

| Rank | Query | Duration | Rows |
|---|---|---|---|
| 1 | task_activity (last 10) | 215ms | 0 |
| 2 | tasks assigned (join: task_assignees) | 68ms | 1 |
| 3 | projects (getProjectsForWorkspace) | 60ms | 1 |
| 4 | workspace_members (getWorkspaceBySlug) | 55ms | 1 |
| 5 | tasks upcoming 7d | 50ms | 0 |
| 6 | notes (getWorkspaceNotes) | 47ms | 1 |
| 7 | tasks due today | 46ms | 0 |
| 8 | workspace_members RPC (with email) | 46ms | 1 |
| 9 | tasks assigned (single assignee) | 44ms | 0 |
| 10 | tasks all IDs+titles (no limit) | 42ms | 4 |
| 11 | meetings today | 42ms | 0 |
| 12 | project_favorites | 40ms | 0 |

### Critical Path Estimate

| Step | Slowest query | External latency |
|---|---|---|
| Batch 1 (8 parallel) | `tasks assigned (join: task_assignees)` | 68ms |
| Batch 2 (2 parallel) | `task_activity (last 10)` | 215ms |
| **Sum (external)** | | **283ms** |
| Observed streaming gap | | **1020ms** |
| Extra overhead (React render, data merge, Vercel cold start) | | **737ms** |

## 7. Answer: Which Async Operation Keeps the HTTP Stream Open

**The stream stays open because `DashboardContent` (Suspense boundary B:1) is executing.**

The server:
- Flushes the shell (layouts + sidebar data + page heading + fallback skeleton) in 2ms
- Enters Suspense boundary B:1 and starts `DashboardContent`
- Fires **10 Supabase queries** across 2 sequential batches
- Waits for the last query to finish, then renders + flushes

| Milestone | Time | Cumulative |
|---|---|---|
| Shell flushed | +2ms | 34605 bytes |
| Streaming gap (queries + render) | 1020ms | — |
| B:1 resolved (DashboardContent) | +1022ms | 39773 bytes |
| Stream ends | +1025ms | 39773 bytes |

From external measurement, the slowest query is **`task_activity (last 10)`** at **215ms**.
However, actual server-to-Supabase latency is likely lower. The true critical path is
determined by the slowest query within Vercel's edge network.

### Chunk Metrics

| Property | Value |
|---|---|
| Average shell chunk | 6921 bytes |
| Average content chunk | 2584 bytes |
| Largest chunk | 15643 bytes |
| Time between shell chunks | ≈0ms (arrive in single TCP window) |
| Time between content chunks | 3ms |
| Gap from shell end to content start | 1020ms |
| Time from B:1 resolution to socket close | 3ms |

## 8. Chunk Headers

| # | +ms | First 100 bytes |
|---|---|---|
| 0 | +2ms | `<!DOCTYPE html><html lang="en" class="__variable_8adcd2"><head><meta charSet="utf-8"/><meta name="vi` |
| 1 | +2ms | `base">Assigned to you</h3></div><div class="px-5 pb-5 pt-0"><div class="h-20 animate-pulse rounded b` |
| 2 | +2ms | `ow();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(` |
| 3 | +2ms | `00-a:$RT+300-a)))):b.parentNode.removeChild(b)};$RC("B:0","S:0")</script><script>(self.__next_f=self` |
| 4 | +2ms | `projects\"}]}],[\"$\",\"div\",null,{\"ref\":\"$undefined\",\"className\":\"px-5 pb-5 pt-0\",\"childr` |
| 5 | +1022ms | `<script>self.__next_f.push([1,"1d:[false,[\"$\",\"div\",null,{\"className\":\"grid grid-cols-1 gap-4` |
| 6 | +1025ms | `<div hidden id="S:1"><div class="grid grid-cols-1 gap-4 lg:grid-cols-2 auto-rows-min"><div class="ro` |

---
_Generated at 2026-07-07T08:27:41.810Z_