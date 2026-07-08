# Supabase Fetch Trace

**Route**: Dashboard — `/fetch-1783413935569`
**Supabase**: https://kehumsoipwvrzkomfyey.supabase.co
**Method**: Playwright Chromium + Resource Timing API + `performance.mark()`
**Date**: 2026-07-07T08:46:10.429Z

### Network Connection Timing (from Node.js)

Measured by opening a raw TCP socket + TLS session from macOS to Supabase:

| Phase | Best of 3 runs (ms) |
|---|---|
| DNS resolution | 6.01 |
| TCP connect | 21.49 |
| TLS handshake | 26.52 |
| **Connection total** | **54.02** |

*Note: Resource Timing API from the browser cannot expose DNS/TCP/TLS for cross-origin
requests (Supabase). The values above are from Node.js raw sockets and represent the
connection establishment time from macOS. Vercel's edge functions will have different
(likely faster) connection timing since they are geographically closer to Supabase.*

## 1. Aggregate Metrics

| Metric | Value |
|---|---|
| Total queries | 12 |
| Total fetch time (serial, no parallelism) | 806.6ms |
| Total response bytes | 1035 (1.0 KB) |
| Total rows returned | 9 |

| Phase | Total (ms) | Avg (ms) | % of total |
|---|---|---|---|
| SDK overhead (before fetch) | 1.20 | 0.10 | 0.1% |
| Body download (text) | 3.70 | 0.31 | 0.5% |
| JSON.parse | 0.10 | 0.01 | 0.0% |
| Transform (row mapping) | 1.40 | 0.12 | 0.2% |
| Waiting (server processing) | 800.20 | 66.68 | 99.2% |
| **Total** | **806.6** | **67.2** | **100%** |

| Network phase | Total (ms) | Avg (ms) | Source |
|---|---|---|---|
| Body download (text) | 3.70 | 0.31 | Browser |
| DNS lookup | 6.01 | 6.01 | Node.js raw socket |
| TCP connect | 21.49 | 21.49 | Node.js raw socket |
| TLS handshake | 26.52 | 26.52 | Node.js raw socket |

| Processing phase | Total (ms) | Avg (ms) | Source |
|---|---|---|---|
| SDK overhead (before fetch) | 1.20 | 0.10 | Browser |
| Waiting (server processing) | 800.20 | 66.68 | Inferred (total − known phases) |
| Response → body read | 0.00 | 0.00 | Browser |
| Body download (text) | 3.70 | 0.31 | Browser |
| JSON.parse | 0.10 | 0.01 | Browser |
| Transform (row mapping) | 1.40 | 0.12 | Browser |

## 2. Per-Query Breakdown

### 1. `workspace_members (getWorkspaceBySlug)`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/workspace_members?workspace_id=eq.f5b80a73-aecb-4ee3-bda7-31aca4a22bb9&...
**Caller**: getWorkspaceBySlug
**Status**: 200 | **Rows**: 1 | **Bytes**: 0.0 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 47.10 | 97% |
| SDK overhead (before fetch) | 1.20 | 2% |
| Transform (row mapping) | 0.20 | 0% |
| Body download (text) | 0.10 | 0% |
| JSON.parse | 0.00 | 0% |
| **Total** | **48.60** | **100%** |

```
 SDK █ 1.2ms
 Wait ██████████████████████████████ 47.1ms
 Body █ 0.1ms
 JSON █ -
 Xform █ 0.2ms
```

Full lifecycle:

```
Supabase call:  workspace_members (getWorkspaceBySlug)
   │
   ├─ SDK overhead 1.20ms
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 47.10ms (server processes query)
   │  └─ response (200)
   ├─ body.text() 0.10ms
   └─ transform 0.20ms
   return (1 rows, 0.0 KB)
```

### 2. `projects (getProjectsForWorkspace)`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/projects?workspace_id=eq.f5b80a73-aecb-4ee3-bda7-31aca4a22bb9&select=id...
**Caller**: getProjectsForWorkspace
**Status**: 400 | **Rows**: 1 | **Bytes**: 0.1 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 43.50 | 99% |
| Body download (text) | 0.30 | 1% |
| Transform (row mapping) | 0.30 | 1% |
| JSON.parse | 0.00 | 0% |
| **Total** | **44.10** | **100%** |

```
 SDK █ -
 Wait ██████████████████████████████ 43.5ms
 Body █ 0.3ms
 JSON █ -
 Xform █ 0.3ms
```

Full lifecycle:

```
Supabase call:  projects (getProjectsForWorkspace)
   │
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 43.50ms (server processes query)
   │  └─ response (400)
   ├─ body.text() 0.30ms
   └─ transform 0.30ms
   return (1 rows, 0.1 KB)
```

### 3. `tasks assigned (single assignee)`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/tasks?project_id=in.("53b685f6-d03d-4ad5-95d0-ab07f8277328")&assignee_i...
**Caller**: DashboardContent batch 1
**Status**: 200 | **Rows**: 0 | **Bytes**: 0.0 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 57.80 | 99% |
| Body download (text) | 0.20 | 0% |
| JSON.parse | 0.10 | 0% |
| Transform (row mapping) | 0.00 | 0% |
| **Total** | **58.10** | **100%** |

```
 SDK █ -
 Wait ██████████████████████████████ 57.8ms
 Body █ 0.2ms
 JSON █ 0.1ms
 Xform █ -
```

Full lifecycle:

```
Supabase call:  tasks assigned (single assignee)
   │
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 57.80ms (server processes query)
   │  └─ response (200)
   ├─ body.text() 0.20ms
   ├─ JSON.parse 0.10ms
   return (0 rows, 0.0 KB)
```

### 4. `tasks assigned (join: task_assignees)`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/task_assignees?user_id=eq.fe4fed1e-1f39-411b-9929-460952a70214&select=t...
**Caller**: DashboardContent batch 1
**Status**: 400 | **Rows**: 1 | **Bytes**: 0.1 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 46.50 | 99% |
| Body download (text) | 0.30 | 1% |
| Transform (row mapping) | 0.10 | 0% |
| JSON.parse | 0.00 | 0% |
| **Total** | **46.90** | **100%** |

```
 SDK █ -
 Wait ██████████████████████████████ 46.5ms
 Body █ 0.3ms
 JSON █ -
 Xform █ 0.1ms
```

Full lifecycle:

```
Supabase call:  tasks assigned (join: task_assignees)
   │
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 46.50ms (server processes query)
   │  └─ response (400)
   ├─ body.text() 0.30ms
   └─ transform 0.10ms
   return (1 rows, 0.1 KB)
```

### 5. `tasks due today`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/tasks?project_id=in.("53b685f6-d03d-4ad5-95d0-ab07f8277328")&due_date=e...
**Caller**: DashboardContent batch 1
**Status**: 200 | **Rows**: 0 | **Bytes**: 0.0 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 50.30 | 99% |
| Body download (text) | 0.40 | 1% |
| JSON.parse | 0.00 | 0% |
| Transform (row mapping) | 0.00 | 0% |
| **Total** | **50.70** | **100%** |

```
 SDK █ -
 Wait ██████████████████████████████ 50.3ms
 Body █ 0.4ms
 JSON █ -
 Xform █ -
```

Full lifecycle:

```
Supabase call:  tasks due today
   │
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 50.30ms (server processes query)
   │  └─ response (200)
   ├─ body.text() 0.40ms
   return (0 rows, 0.0 KB)
```

### 6. `tasks upcoming 7d`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/tasks?project_id=in.("53b685f6-d03d-4ad5-95d0-ab07f8277328")&due_date=g...
**Caller**: DashboardContent batch 1
**Status**: 200 | **Rows**: 0 | **Bytes**: 0.0 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 104.80 | 100% |
| Body download (text) | 0.30 | 0% |
| JSON.parse | 0.00 | 0% |
| Transform (row mapping) | 0.00 | 0% |
| **Total** | **105.10** | **100%** |

```
 SDK █ -
 Wait ██████████████████████████████ 104.8ms
 Body █ 0.3ms
 JSON █ -
 Xform █ -
```

Full lifecycle:

```
Supabase call:  tasks upcoming 7d
   │
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 104.80ms (server processes query)
   │  └─ response (200)
   ├─ body.text() 0.30ms
   return (0 rows, 0.0 KB)
```

### 7. `project_favorites`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/project_favorites?user_id=eq.fe4fed1e-1f39-411b-9929-460952a70214&proje...
**Caller**: DashboardContent batch 1
**Status**: 200 | **Rows**: 0 | **Bytes**: 0.0 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 43.10 | 99% |
| Body download (text) | 0.30 | 1% |
| Transform (row mapping) | 0.10 | 0% |
| JSON.parse | 0.00 | 0% |
| **Total** | **43.50** | **100%** |

```
 SDK █ -
 Wait ██████████████████████████████ 43.1ms
 Body █ 0.3ms
 JSON █ -
 Xform █ 0.1ms
```

Full lifecycle:

```
Supabase call:  project_favorites
   │
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 43.10ms (server processes query)
   │  └─ response (200)
   ├─ body.text() 0.30ms
   └─ transform 0.10ms
   return (0 rows, 0.0 KB)
```

### 8. `tasks all IDs+titles (no limit)`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/tasks?project_id=in.("53b685f6-d03d-4ad5-95d0-ab07f8277328")&select=id,...
**Caller**: DashboardContent batch 1
**Status**: 200 | **Rows**: 4 | **Bytes**: 0.6 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 42.50 | 98% |
| Body download (text) | 0.50 | 1% |
| Transform (row mapping) | 0.30 | 1% |
| JSON.parse | 0.00 | 0% |
| **Total** | **43.30** | **100%** |

```
 SDK █ -
 Wait ██████████████████████████████ 42.5ms
 Body █ 0.5ms
 JSON █ -
 Xform █ 0.3ms
```

Full lifecycle:

```
Supabase call:  tasks all IDs+titles (no limit)
   │
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 42.50ms (server processes query)
   │  └─ response (200)
   ├─ body.text() 0.50ms
   └─ transform 0.30ms
   return (4 rows, 0.6 KB)
```

### 9. `meetings today`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/meetings?workspace_id=eq.f5b80a73-aecb-4ee3-bda7-31aca4a22bb9&start_tim...
**Caller**: DashboardContent batch 1
**Status**: 200 | **Rows**: 0 | **Bytes**: 0.0 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 46.00 | 100% |
| Body download (text) | 0.20 | 0% |
| JSON.parse | 0.00 | 0% |
| Transform (row mapping) | 0.00 | 0% |
| **Total** | **46.20** | **100%** |

```
 SDK █ -
 Wait ██████████████████████████████ 46.0ms
 Body █ 0.2ms
 JSON █ -
 Xform █ -
```

Full lifecycle:

```
Supabase call:  meetings today
   │
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 46.00ms (server processes query)
   │  └─ response (200)
   ├─ body.text() 0.20ms
   return (0 rows, 0.0 KB)
```

### 10. `notes (getWorkspaceNotes)`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/notes?workspace_id=eq.f5b80a73-aecb-4ee3-bda7-31aca4a22bb9&select=id,ti...
**Caller**: DashboardContent batch 1
**Status**: 400 | **Rows**: 1 | **Bytes**: 0.1 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 60.60 | 99% |
| Body download (text) | 0.40 | 1% |
| Transform (row mapping) | 0.20 | 0% |
| JSON.parse | 0.00 | 0% |
| **Total** | **61.20** | **100%** |

```
 SDK █ -
 Wait ██████████████████████████████ 60.6ms
 Body █ 0.4ms
 JSON █ -
 Xform █ 0.2ms
```

Full lifecycle:

```
Supabase call:  notes (getWorkspaceNotes)
   │
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 60.60ms (server processes query)
   │  └─ response (400)
   ├─ body.text() 0.40ms
   └─ transform 0.20ms
   return (1 rows, 0.1 KB)
```

### 11. `workspace_members RPC (with email)`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/rpc/get_workspace_members_with_email?p_workspace_id=f5b80a73-aecb-4ee3-...
**Caller**: DashboardContent batch 2
**Status**: 200 | **Rows**: 1 | **Bytes**: 0.2 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 43.90 | 98% |
| Body download (text) | 0.50 | 1% |
| Transform (row mapping) | 0.20 | 0% |
| JSON.parse | 0.00 | 0% |
| **Total** | **44.60** | **100%** |

```
 SDK █ -
 Wait ██████████████████████████████ 43.9ms
 Body █ 0.5ms
 JSON █ -
 Xform █ 0.2ms
```

Full lifecycle:

```
Supabase call:  workspace_members RPC (with email)
   │
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 43.90ms (server processes query)
   │  └─ response (200)
   ├─ body.text() 0.50ms
   └─ transform 0.20ms
   return (1 rows, 0.2 KB)
```

### 12. `task_activity (last 10)`

**Endpoint**: https://kehumsoipwvrzkomfyey.supabase.co/rest/v1/task_activity?select=id,event_type,metadata,created_at,actor_id,task_id...
**Caller**: DashboardContent batch 2
**Status**: 200 | **Rows**: 0 | **Bytes**: 0.0 KB

| Phase | Duration (ms) | % of query |
|---|---|---|
| Waiting (server processing) | 214.10 | 100% |
| Body download (text) | 0.20 | 0% |
| JSON.parse | 0.00 | 0% |
| Transform (row mapping) | 0.00 | 0% |
| **Total** | **214.30** | **100%** |

```
 SDK █ -
 Wait ██████████████████████████████ 214.1ms
 Body █ 0.2ms
 JSON █ -
 Xform █ -
```

Full lifecycle:

```
Supabase call:  task_activity (last 10)
   │
   ├─ fetch()
   │  ├─ DNS  6.01ms (Node.js raw socket)
   │  ├─ TCP  21.49ms (Node.js raw socket)
   │  ├─ TLS  26.52ms (Node.js raw socket)
   │  ├─ Waiting 214.10ms (server processes query)
   │  └─ response (200)
   ├─ body.text() 0.20ms
   return (0 rows, 0.0 KB)
```

## 3. React Flight Serialization

React Flight serialization happens server-side (in the Vercel edge function after
all Supabase queries complete, before the RSC stream is flushed). It cannot be
measured from the client.

Based on the RSC_STREAM_TRACE.md results, the gap between the last Supabase query
completing and the RSC chunk being flushed includes:

1. JavaScript object → RSC payload encoding (React Flight serializer)
2. Streaming the UTF-8 encoded payload into the HTTP response
3. Flushing the TCP buffer

From the CPU_EXECUTION_BREAKDOWN.md, total ScriptDuration was **77ms** across
all page JavaScript — this includes React Flight serialization. The serialization
itself is estimated at **~30-50ms** based on the 5KB payload size.

## 4. Summary

| Query | Total | Bottleneck | % of query |
|---|---|---|---|
| workspace_members (getWorkspaceBySlug) | 48.6ms | Waiting (server processing) | 97% |
| projects (getProjectsForWorkspace) | 44.1ms | Waiting (server processing) | 99% |
| tasks assigned (single assignee) | 58.1ms | Waiting (server processing) | 99% |
| tasks assigned (join: task_assignees) | 46.9ms | Waiting (server processing) | 99% |
| tasks due today | 50.7ms | Waiting (server processing) | 99% |
| tasks upcoming 7d | 105.1ms | Waiting (server processing) | 100% |
| project_favorites | 43.5ms | Waiting (server processing) | 99% |
| tasks all IDs+titles (no limit) | 43.3ms | Waiting (server processing) | 98% |
| meetings today | 46.2ms | Waiting (server processing) | 100% |
| notes (getWorkspaceNotes) | 61.2ms | Waiting (server processing) | 99% |
| workspace_members RPC (with email) | 44.6ms | Waiting (server processing) | 98% |
| task_activity (last 10) | 214.3ms | Waiting (server processing) | 100% |

| Category | Total (ms) | % |
|---|---|---|
| Network (DNS+TCP+TLS+body download) | 57.72 | 96% |
| Processing (SDK+wait+JSON+transform) | 2.70 | 4% |

## 5. Raw Data

| Query | DNS* | TCP* | TLS* | Wait | Body | JSON | Xform | Total |
|---|---|---|---|---|---|---|---|---|---|
| *(connection) | 6.0 | 21.5 | 26.5 | — | — | — | — | — |
| workspace_members (getWorkspaceBySlug) | — | — | — | 47.1 | 0.1 | 0.0 | 0.2 | 48.6 |
| projects (getProjectsForWorkspace) | — | — | — | 43.5 | 0.3 | 0.0 | 0.3 | 44.1 |
| tasks assigned (single assignee) | — | — | — | 57.8 | 0.2 | 0.1 | 0.0 | 58.1 |
| tasks assigned (join: task_assignees) | — | — | — | 46.5 | 0.3 | 0.0 | 0.1 | 46.9 |
| tasks due today | — | — | — | 50.3 | 0.4 | 0.0 | 0.0 | 50.7 |
| tasks upcoming 7d | — | — | — | 104.8 | 0.3 | 0.0 | 0.0 | 105.1 |
| project_favorites | — | — | — | 43.1 | 0.3 | 0.0 | 0.1 | 43.5 |
| tasks all IDs+titles (no limit) | — | — | — | 42.5 | 0.5 | 0.0 | 0.3 | 43.3 |
| meetings today | — | — | — | 46.0 | 0.2 | 0.0 | 0.0 | 46.2 |
| notes (getWorkspaceNotes) | — | — | — | 60.6 | 0.4 | 0.0 | 0.2 | 61.2 |
| workspace_members RPC (with email) | — | — | — | 43.9 | 0.5 | 0.0 | 0.2 | 44.6 |
| task_activity (last 10) | — | — | — | 214.1 | 0.2 | 0.0 | 0.0 | 214.3 |

*DNS/TCP/TLS are connection-level (same for all queries to the same host), measured once from Node.js.

---
_Generated at 2026-07-07T08:46:10.429Z_