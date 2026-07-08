# RSC Data Dependency Graph

**Purpose**: Determine whether the server performs duplicate or unnecessary Supabase fetches during a single page render.

**Method**: Static analysis of all Server Components, Server Actions, and data functions — every `supabase.from()`, `supabase.rpc()`, and `cache()` call traced to its caller and timing relative to the RSC stream.

---

## 1. Complete Call Graph — Every Page

### Legend

```
━ synchronous call (within same Server Component)
┃
┃ ═ cache()-wrapped → deduplicated by args
┃ ⏤ normal call
┃ → ┃ Suspense boundary
┃
Layout
  ↓
Page Component
  ↓
Content Component (inside Suspense)
  ↓
data function
```

---

### 1a. Dashboard — `/{workspaceSlug}`

```
DashboardLayout (outside Suspense)
  ┃
  ═ createClient()                 [cache — no args]
  ┃
  ═ supabase.auth.getSession()     [local JWT decode, ~0ms net]
  ┃
  ═ WorkspaceSwitcher
       ┃
       ═ createClient()             [cache hit]
       ┃
       supabase.from("workspaces")
         .select("slug, name")
         .is("archived_at", null)
         .order("created_at", true)

WorkspaceLayout (outside Suspense)
  ┃
  ═ createClient()                 [cache hit]
  ┃
  ═ getWorkspaceBySlug(slug)       [cache — arg: slug]
  ┃   supabase.from("workspaces").select("id, name, slug, ...").eq("slug", slug).maybeSingle()
  ┃
  ═ supabase.auth.getSession()     [local JWT, ~0ms]
  ┃
  ═ getProjectsForWorkspace(id)    [cache — arg: workspaceId]
  ┃   supabase.from("projects")
  ┃     .select("id, name, due_date, project_favorites(user_id)")
  ┃     .eq("workspace_id", id).is("archived_at", null).order("created_at", true)
  ┃
  ═ supabase.from("workspace_members").select("role")
      .eq("workspace_id", id).eq("user_id", ...).maybeSingle()
  │
  ═ ProjectSidebar (client)
  ═ LazyCommandPalette (client)

WorkspaceHomePage (outside Suspense)
  ┃
  ═ createClient()                 [cache hit]
  ┃
  ═ getWorkspaceBySlug(slug)       [cache hit]
  ┃
  ═ supabase.auth.getSession()     [local JWT, ~0ms]
  ┃
  ═ getProjectsForWorkspace(id)    [cache hit]
  ┃
  ┃ → Suspense (B:1, fallback = DashboardSkeleton)
  ┃
  ═ DashboardContent (Server Component, inside Suspense)
       ┃
       ═ createClient()            [cache hit — same instance]
       ┃
       ═ Promise.all(8) — Batch 1: ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       ┃  │
       ┃  ├─ supabase.from("tasks") ①
       ┃  │   .select("id, title, project_id, due_date, priority")
       ┃  │   .in("project_id", projectIds)
       ┃  │   .eq("assignee_id", userId)
       ┃  │   .is("archived_at", null).neq("status", "done")
       ┃  │   .order("due_date", true, nullsFirst: false).limit(10)
       ┃  │   → "Assigned to you" card
       ┃  │
       ┃  ├─ supabase.from("task_assignees") ②
       ┃  │   .select("task_id, tasks!inner(id, title, project_id, due_date, priority, status, archived_at)")
       ┃  │   .eq("user_id", userId).in("tasks.project_id", projectIds)
       ┃  │   → "Assigned to you" card (join path)
       ┃  │
       ┃  ├─ supabase.from("tasks") ③
       ┃  │   .select("id, title, project_id, due_date, priority")
       ┃  │   .in("project_id", projectIds)
       ┃  │   .eq("due_date", today)
       ┃  │   .is("archived_at", null).neq("status", "done")
       ┃  │   .order("priority", true).limit(10)
       ┃  │   → "Due today" card
       ┃  │
       ┃  ├─ supabase.from("tasks") ④
       ┃  │   .select("id, title, project_id, due_date, priority")
       ┃  │   .in("project_id", projectIds)
       ┃  │   .gt("due_date", today).lte("due_date", weekAhead)
       ┃  │   .is("archived_at", null).neq("status", "done")
       ┃  │   .order("due_date", true).limit(10)
       ┃  │   → "Upcoming deadlines" card
       ┃  │
       ┃  ├─ supabase.from("project_favorites") ⑤
       ┃  │   .select("project_id").eq("user_id", userId)
       ┃  │   .in("project_id", projectIds)
       ┃  │   → "Favorite projects" card
       ┃  │
       ┃  ├─ supabase.from("tasks") ⑥
       ┃  │   .select("id, title, project_id")
       ┃  │   .in("project_id", projectIds)
       ┃  │   → ID→title mapping for activity entries
       ┃  │
       ┃  ├─ getWorkspaceNotes(workspace.id) ⑦
       ┃  │   supabase.from("notes")
       ┃  │     .select("id, workspace_id, project_id, type, title, body, ...")
       ┃  │     .eq("workspace_id", id).order("updated_at", false)
       ┃  │   → "Announcements" card
       ┃  │
       ┃  └─ supabase.from("meetings") ⑧
       ┃      .select("id, title, start_time, end_time, project_id")
       ┃      .eq("workspace_id", workspace.id)
       ┃      .gte("start_time", ...).lt("start_time", ...)
       ┃      .order("start_time", true)
       ┃      → "Today's meetings" card
       ┃
       ═ Sequential Batch 2: ──────────────────────────────
       ┃
       ═ supabase.from("task_activity") ⑨
       │   .select("id, event_type, metadata, created_at, actor_id, task_id")
       │   .in("task_id", allTaskIds)
       │   .order("created_at", false).limit(10)
       │   → "Recent activity" card
       │
       ═ supabase.rpc("get_workspace_members_with_email") ⑩
           { p_workspace_id: workspace.id }
           → emailByUserId map for activity rendering
```

**Total queries inside Suspense boundary for Dashboard: 10**

---

### 1b. Project (Kanban) — `/{workspaceSlug}/{projectId}`

```
WorkspaceLayout (same as 1a — cached paths)
  ═ ... (same cached fetches)

ProjectPage
  ┃
  ┃ → Suspense (B:1, fallback = ProjectSkeleton)
  ┃
  ═ ProjectContent (inside Suspense)
       ┃
       ═ createClient()                [cache hit]
       ┃
       ═ supabase.from("projects") ①
       │   .select("id, name, workspace_id, description, due_date, status, project_favorites(user_id)")
       │   .eq("id", projectId).maybeSingle()
       │   → ProjectHeader + membership
       │
       ═ Promise.all: ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       │  │
       │  ├─ supabase.auth.getSession() ②
       │  │   → user id for membership check
       │  │
       │  ├─ supabase.from("tasks") ③
       │  │   .select("id, title, status, description, due_date, priority, assignee_id, created_at, progress, task_labels(labels(id, name, color)), checklist_items(completed), comments(id), task_attachments(id), task_assignees(user_id)")
       │  │   .eq("project_id", project.id).is("archived_at", null)
       │  │   .order("status", true).order("position", true)
       │  │   → KanbanBoard (ALL tasks with ALL nested relations)
       │  │
       │  ├─ supabase.rpc("get_workspace_members_with_email") ④
       │  │   { p_workspace_id: project.workspace_id }
       │  │   → ProjectHeader + KanbanBoard members prop
       │  │
       │  └─ supabase.from("workspace_members") ⑤
       │      .select("role")
       │      .eq("workspace_id", project.workspace_id)
       │      .eq("user_id", session?.user?.id ?? "")
       │      .maybeSingle()
       │      → isAdminOrOwner flag
       │
       ═ KanbanBoard (client)  →  TaskDetailDialog (client, lazy)
           ├─ getProjectMembers(projectId)         ⑥ [CLIENT: re-fetches members]
           ├─ getTaskActivity(taskId)              ⑦ [CLIENT: per-task activity]
           ├─ getProjectActivity(projectId)        ⑧ [CLIENT: project activity]
           ├─ getArchivedTasks(projectId)          ⑨ [CLIENT: archived tasks]
           └─ Realtime subscription (tasks table)
```

**Total queries inside Suspense boundary for Project: 5 (server) + 4+ (client, lazy)**

---

### 1c. Calendar — `/{workspaceSlug}/calendar`

```
WorkspaceLayout (same cached paths)

WorkspaceCalendarPage
  ┃ → Suspense (B:1, fallback = CalendarSkeleton)
  ┃
  ═ CalendarContent (inside Suspense)
       ┃
       ═ createClient()                [cache hit]
       ┃
       ═ getWorkspaceBySlug(slug)      [cache hit]
       ┃
       ═ getProjectsForWorkspace(id)   [cache hit]
       ┃
       ═ Promise.all: ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       │  │
       │  ├─ supabase.from("tasks") ①
       │  │   .select("id, title, due_date, priority, assignee_id")
       │  │   .in("project_id", projectIds)
       │  │   .not("due_date", "is", null)
       │  │   .is("archived_at", null).neq("status", "done")
       │  │   → WorkspaceCalendarClient tasks
       │  │
       │  └─ supabase.rpc("get_workspace_members_with_email") ②
       │      { p_workspace_id: workspace.id }
       │      → email resolution for meetings
       │
       ═ getWorkspaceMeetings(id, emailByUserId) ③
           supabase.from("meetings")
             .select("id, workspace_id, project_id, title, description, start_time, end_time, meeting_attendees(user_id)")
             .eq("workspace_id", id).order("start_time", true)
           → WorkspaceCalendarClient meetings
```

**Total queries inside Suspense boundary for Calendar: 3 (server)**

---

### 1d. Notes — `/{workspaceSlug}/notes`

```
WorkspaceLayout (same cached paths)

WorkspaceNotesPage
  ┃ → Suspense (B:1, fallback = NotesSkeleton)
  ┃
  ═ NotesContent (inside Suspense)
       ┃
       ═ createClient()                [cache hit]
       ┃
       ═ getWorkspaceBySlug(slug)      [cache hit]
       ┃
       ═ supabase.auth.getSession()    [local JWT]
       ┃
       ═ getProjectsForWorkspace(id)   [cache hit]
       ┃
       ═ getWorkspaceNotes(id)         ①
           supabase.from("notes")
             .select("id, workspace_id, project_id, type, title, body, ...")
             .eq("workspace_id", id).order("updated_at", false)
           → NotesClient
```

**Total queries inside Suspense boundary for Notes: 1 (server)**

---

### 1e. Activity — `/{workspaceSlug}/activity`

```
WorkspaceLayout (same cached paths)

WorkspaceActivityPage (outside Suspense)
  ┃
  ═ createClient()                 [cache hit]
  ┃
  ═ getWorkspaceBySlug(slug)       [cache hit]
  ┃
  ═ supabase.auth.getSession()     [local JWT]
  ┃
  ┃ → Suspense (B:1, fallback = ActivitySkeleton)
  ┃
  ═ ActivityContent (inside Suspense)
       ┃
       ═ createClient()            [cache hit]
       ┃
       ═ getProjectsForWorkspace(id)  [cache hit]
       ┃
       ═ supabase.from("tasks") ①
       │   .select("id, title, project_id")
       │   .in("project_id", projectIds)
       │   → ID→title→project mapping
       │
       ═ supabase.from("task_activity") ②
       │   .select("id, event_type, metadata, created_at, actor_id, task_id")
       │   .in("task_id", allTaskIds)
       │   .order("created_at", false).limit(50)
       │   → activity list
       │
       ═ supabase.rpc("get_workspace_members_with_email") ③
           { p_workspace_id: workspaceId }
           → email resolution
```

**Total queries inside Suspense boundary for Activity: 3 (server)**

---

## 2. Duplicate Query Detection

### 2a. Exact Query Duplicates Within Same RSC Render

**Finding: ZERO exact duplicate queries within any single page render.**

Every inline `supabase.from()` call has a distinct filter combination (different `.eq()`, `.in()`, `.neq()`, `.order()`, `.limit()` values). No two queries in the same render produce identical SQL.

---

### 2b. Table-Level Overlap Within Same RSC Render

Several queries hit the same table with overlapping (but not identical) filters:

#### Table: `tasks` — Dashboard page (3 queries in parallel + 1 sequential)

| Query | Filter | Rows | Purpose |
|---|---|---|---|
| ① | `assignee_id = X, status ≠ done, limit 10` | ⊆ all | "Assigned to you" card |
| ③ | `due_date = today, status ≠ done, limit 10` | ⊆ all | "Due today" card |
| ④ | `due_date ∈ (today, +7d], status ≠ done, limit 10` | ⊆ all | "Upcoming" card |
| ⑥ | (no status/date filter) — returns ALL task IDs | = all | ID→title mapping for activity |

**Impact**: Query ⑥ returns every task (no filter on status/archived) when queries ①③④ return subsets of the same rows. The same task row can be fetched 2-4 times within a single render. The wasted time is bounded by the Supabase connection pool reusing cached pages, but each query still incurs ~42ms of "Waiting (server processing)" per the SUPABASE_FETCH_TRACE.

If query ⑥ ran after ①③④, it could materialize the ID→title mapping from the already-fetched results. But they're in the same `Promise.all()`, so no dependency exists.

#### Table: `task_activity` — Dashboard vs. Activity (different pages, never same render)

| Page | Filter | Limit |
|---|---|---|
| Dashboard | `task_id IN (allTaskIds)` | 10 |
| Activity | `task_id IN (allTaskIds)` | 50 |

These are technically identical queries except for LIMIT. But since they're on different pages (different RSC renders), this is not a duplicate within a single request.

#### RPC: `get_workspace_members_with_email` — called on 4 pages

| Page | Arg | Render |
|---|---|---|
| Dashboard | `{p_workspace_id: workspace.id}` | Batch 2 |
| Project | `{p_workspace_id: project.workspace_id}` | Parallel |
| Calendar | `{p_workspace_id: workspace.id}` | Parallel |
| Activity | `{p_workspace_id: workspaceId}` | Sequential |

Each call happens in a separate RSC render (different pages). **No duplicate within a single request.** However, this is the single most frequently executed query in the entire application — 4 server renders + every `AuditLogDialog.open` + every `WorkspaceMembersDialog.open` + every `getProjectMembers()` call from the client.

---

### 2c. cache() Effectiveness

| Function | Key | Called by | Call count | Saved |
|---|---|---|---|---|
| `createClient()` | (none) | Every component/action | ~5-15 per render | 1 DB fetch (creates 1 supabase instance) |
| `getWorkspaceBySlug(slug)` | `slug` | Layout + Page | 2 per render | 1 Supabase query (~46ms) |
| `getProjectsForWorkspace(workspaceId)` | `workspaceId` | Layout + Page | 2 per render | 1 Supabase query (~78ms) |

**cache() is working correctly** for the 3 functions it wraps. Every render saves ~124ms of Supabase queries.

However, several functions that are called from multiple Server Components are NOT cached:

| Function | Called by | Within same render? | Could cache save? |
|---|---|---|---|
| `getWorkspaceNotes(workspaceId)` | Dashboard (notes card) + Notes page | **No** (different pages) | No — not same render |
| `getWorkspaceMeetings(workspaceId, emailByUserId)` | Calendar page | 1 call per render | No — single call |
| `get_workspace_members_with_email` RPC | Dashboard, Project, Calendar, Activity | **No** (different pages) | No — not same render |

No cache opportunity is missed for same-render deduplication. All multi-call functions that fire within the same render are already cached.

---

### 2d. cache Miss Analysis

**No cache misses detected.** All 3 cached functions resolve correctly:

- `createClient()` — zero arguments, always returns the same promise per request
- `getWorkspaceBySlug(slug)` — arguments match (same `workspaceSlug` passed from layout to page)
- `getProjectsForWorkspace(workspaceId)` — arguments match (same `workspace.id` passed from layout to page)

---

## 3. Duplicate Serialization Analysis

### 3a. Objects Serialized into Flight Payload

| Object | Source | Consumers | Prop mapping | Duplicated? |
|---|---|---|---|---|
| `workspace` | `getWorkspaceBySlug` | `ProjectSidebar`, `DashboardContent`, `LazyCommandPalette` | `workspaceSettings` (remapped field names) | **Yes — object remapped into different shape** |
| `projects` | `getProjectsForWorkspace` | `ProjectSidebar`, `LazyCommandPalette`, `DashboardContent`, calendar/notes/activity pages | Same array reference | No — React Flight deduplicates |
| `members` (Dashboard) | `rpc(...)` | Inline rendering `emailByUserId` Map | Transformed to Map | Not passed to children |
| `members` (Calendar) | `rpc(...)` | `getWorkspaceMeetings` arg + `WorkspaceCalendarClient` | `{user_id, email}[]` | Serialized once |
| `members` (Project) | `rpc(...)` | `ProjectHeader` + `KanbanBoard` | `{user_id, email}[]` | Serialized once |

### 3b. Remapped Object Cost

`workspace` (from `getWorkspaceBySlug`) is remapped to `workspaceSettings` at layout line 57-64:
```ts
workspaceSettings={{
  id: workspace.id,
  name: workspace.name,
  description: workspace.description,
  logoUrl: workspace.logo_url,      // snake_case → camelCase
  defaultTimezone: workspace.default_timezone,  // snake_case → camelCase
  archivedAt: workspace.archived_at,  // snake_case → camelCase
}}
```

This creates a new object with different property names. React Flight cannot deduplicate `workspace` and `workspaceSettings` because they are different shapes. The `workspace` object (~200 bytes serialized) is serialized once, then `workspaceSettings` (~200 bytes) is serialized separately. Total waste: **~200 bytes** in the Flight payload — negligible.

### 3c. Eager Nested Serialization (Project Page)

The Project page's task query fetches nested relations eagerly for ALL tasks:

```sql
select(
  "id, title, status, description, due_date, priority, assignee_id,
   created_at, progress,
   task_labels(labels(id, name, color)),         ← ALL labels for ALL tasks
   checklist_items(completed),                     ← ALL checklists for ALL tasks
   comments(id),                                   ← ALL comment IDs for ALL tasks
   task_attachments(id),                           ← ALL attachment IDs for ALL tasks
   task_assignees(user_id)"                        ← ALL assignees for ALL tasks
)
```

**Estimated serialization cost:**

| Nested relation | Rows in project | Bytes per row | Total serialized | Needed immediately? |
|---|---|---|---|---|
| `task_labels` | 0-3 per task | ~60 | ~0-180 per task | ✅ Displayed on Kanban cards |
| `checklist_items(completed)` | 0-10 per task | ~20 | ~0-200 per task | ✅ Progress indicator on cards |
| `comments(id)` | 0-50 per task | ~40 | ~0-2000 per task | ❌ Only when TaskDetailDialog opens |
| `task_attachments(id)` | 0-5 per task | ~40 | ~0-200 per task | ❌ Only when TaskDetailDialog opens |
| `task_assignees(user_id)` | 0-10 per task | ~40 | ~0-400 per task | ✅ Assignee avatars on cards |

For a project with 20 tasks averaging 10 comments each: **~8000 bytes** of comment IDs serialized eagerly, none used until the user clicks a task. Comments and attachments are the primary serialization waste.

### 3d. Total Estimated Serialization Waste per Page

| Page | Waste | Source |
|---|---|---|
| Dashboard | ~200 bytes | `workspaceSettings` remap |
| Project | ~8-20 KB | Eager comments/attachments for all tasks |
| Calendar | ~0 bytes | Minimal transformation |
| Notes | ~0 bytes | Minimal transformation |
| Activity | ~0 bytes | Minimal transformation |

---

## 4. Cache Effectiveness Summary

| Scope | Functions cached | Functions not cached | Effectiveness |
|---|---|---|---|
| Per-request (React.cache) | 3 | 0 (within same render) | ✅ 100% |
| Across requests (unstable_cache) | 0 | 0 (not used) | N/A |
| Server Action memoization | 0 | ~52 | N/A (each is an independent HTTP request) |

---

## 5. Top 10 Most Expensive Data Dependencies

Ranked by total time * frequency per page render:

| Rank | Query | Table/RPC | Avg time | Page | % of page render |
|---|---|---|---|---|---|
| 1 | `task_activity LIMIT 10` ⑨ | task_activity | 200ms | Dashboard | ~25% (batch 2) |
| 2 | `tasks (full project w/ nesting)` ③ | tasks | ~100ms* | Project | ~40% (parallel) |
| 3 | `get_workspace_members_with_email` | RPC | ~46ms | Every page | 6-10% |
| 4 | `meetings (workspace)` ③ | meetings | ~50ms* | Calendar | ~15% (sequential) |
| 5 | `projects (single)` ① | projects | ~50ms* | Project | ~15% (serial) |
| 6 | `notes (workspace)` | notes | ~48ms | Dashboard, Notes | 6-10% |
| 7 | `tasks (due today)` ③ | tasks | ~46ms | Dashboard | 6% (parallel) |
| 8 | `task_assignees (join)` ② | task_assignees | ~65ms | Dashboard | 8% (parallel) |
| 9 | `tasks (all IDs)` ⑥ | tasks | ~42ms | Dashboard | 5% (parallel) |
| 10 | `task_activity LIMIT 50` ② | task_activity | ~200ms | Activity | ~40% |

*\*Estimated — from `SUPABASE_FETCH_TRACE.md` when available, otherwise estimated from query complexity.*

---

## 6. Duplicate Work Graph

### Exact duplicates within same render: **ZERO**

All queries within a single page render have distinct filters. The 3 `cache()`-wrapped functions successfully deduplicate all cross-component calls.

### Data overlap within same render:

```
Dashboard "tasks" queries (parallel, all hit same table):
  ┌──────────────────────────────────────────┐
  │  tasks ① (assigned, limit 10)            │
  │     ⋂                                    │
  │  tasks ③ (due today, limit 10)           │
  │     ⋂                                    │
  │  tasks ④ (upcoming 7d, limit 10)         │
  │     ⋂                                    │
  │  tasks ⑥ (ALL, no limit)                 │
  └──────────────────────────────────────────┘
  Overlap: rows that are both assigned to user AND
  due today AND returned by the unfiltered query ⑥
  are fetched 2-4 times from Postgres.
```

The `tasks` query ⑥ returns ALL tasks regardless of status/archive state (no `.neq("status", "done")`, no `.is("archived_at", null)`). Queries ①③④ filter to non-done, non-archived subsets. Every non-done, non-archived task appears in at least query ⑥ plus one of ①③④.

If this set is 20 tasks: ~840ms of "Waiting (server processing)" across 4 queries (4 × ~42ms per query from SUPABASE_FETCH_TRACE — actually closer to ~200ms total since queries ①③④ also have additional filters).

### Cross-page duplicates (different renders, informational only):

```
get_workspace_members_with_email RPC
  ┌─ Dashboard ────── {p_workspace_id: W} ───── batch 2 (sequential)
  ├─ Project ──────── {p_workspace_id: W} ───── parallel
  ├─ Calendar ─────── {p_workspace_id: W} ───── parallel
  └─ Activity ─────── {p_workspace_id: W} ───── sequential
  (also: getWorkspaceMembers server action called client-side 3+ times)

  💡 Most frequently repeated data function in the application.
     Called on 4 of 5 pages during RSC, then called again from
     client components (AuditLogDialog, WorkspaceMembersDialog,
     KanbanBoard) on user interaction.
```

### Client-side re-fetch of server-side data:

```
Project page RSC:
  supabase.rpc("get_workspace_members_with_email", { p_workspace_id: W })
  → passed as "members" prop to KanbanBoard ✅

KanbanBoard useEffect (client-side):
  getProjectMembers(projectId)  ← calls the same RPC again ❌
  → unnecessary: data was already in props

  Waste: ~46ms "Waiting" + serialization + network round-trip
```

---

## 7. Opportunities to Eliminate Duplicate Work

These are findings only — **do not implement**.

### P0: Eager comment/attachment loading on Project page

The task query fetches `comments(id)` and `task_attachments(id)` for every task in the project. These are only needed when the task detail dialog opens. For a project with 20 tasks and ~200 comments, this serializes ~8-16KB of IDs that are never displayed during the initial render.

**Waste**: ~8-20KB of Flight payload per project page render.

### P1: Tasks query ⑥ overlaps with queries ①③④ on Dashboard

Query ⑥ (`tasks.select("id, title, project_id").in("project_id", projectIds)`) returns all tasks for the workspace — unfiltered. Queries ①③④ return subsets. The data returned by ⑥ could be derived from the union of ①③④ plus any remaining archived/done tasks.

**Waste**: ~42ms per render of unnecessary Postgres work (the full unfiltered scan). More importantly, this query runs inside the Suspense boundary — it's part of the streaming bottleneck.

### P2: `get_workspace_members_with_email` RPC is not cached across Server Components

While it's not called multiple times within a single render (each page calls it exactly once), the RPC is called on 4 of 5 pages and is the most redundant query in the system. If the app ever renders multiple Suspense boundaries concurrently (e.g., parallel routes), this would become a duplicate.

**Waste**: None within current architecture. Architectural risk if routing changes.

### P3: `KanbanBoard` re-fetches members client-side

`KanbanBoard` receives `members` as a prop from `ProjectContent` but calls `getProjectMembers(projectId)` in a `useEffect`. The server-side data is already complete — the client-side call is redundant.

**Waste**: ~46ms + round-trip on every project page load (client-side).

### P4: `workspace` → `workspaceSettings` remapping

The workspace object from `getWorkspaceBySlug` is remapped to `workspaceSettings` with camelCase keys. This creates two serialized objects ~200 bytes each instead of one. Negligible.

**Waste**: ~200 bytes in Flight payload.

---

## 8. Raw Data: All RSC Queries per Page

### Dashboard (10 server queries inside Suspense)

| # | Table / RPC | Columns | Filters | After prev | Avg (ms) |
|---|---|---|---|---|---|
| ① | tasks | id, title, project_id, due_date, priority | assignee_id=uid, project_id IN (...), archived=null, status≠done, order due_date, limit 10 | In Promise.all | ~57 |
| ② | task_assignees | task_id, tasks!inner(same cols) | user_id=uid, tasks.project_id IN (...) | In Promise.all | ~65 |
| ③ | tasks | id, title, project_id, due_date, priority | project_id IN (...), due_date=today, archived=null, status≠done, order priority, limit 10 | In Promise.all | ~46 |
| ④ | tasks | id, title, project_id, due_date, priority | project_id IN (...), due_date (today,+7d], archived=null, status≠done, order due_date, limit 10 | In Promise.all | ~39 |
| ⑤ | project_favorites | project_id | user_id=uid, project_id IN (...) | In Promise.all | ~50 |
| ⑥ | tasks | id, title, project_id | project_id IN (...) | In Promise.all | ~42 |
| ⑦ | notes | id, workspace_id, project_id, type, title, body, created_by, created_at, updated_at | workspace_id=WID, order updated_at desc | In Promise.all | ~48 |
| ⑧ | meetings | id, title, start_time, end_time, project_id | workspace_id=WID, start_time [today, tomorrow), order start_time | In Promise.all | ~38 |
| ⑨ | task_activity | id, event_type, metadata, created_at, actor_id, task_id | task_id IN (...), order created_at desc, limit 10 | After batch 1 | ~200 |
| ⑩ | get_workspace_members_with_email | — | p_workspace_id=WID | After batch 1 | ~46 |

### Project (5 server queries inside Suspense)

| # | Table / RPC | Columns | Filters | Parallel? | Avg (ms) |
|---|---|---|---|---|---|
| ① | projects | id, name, workspace_id, description, due_date, status, project_favorites(user_id) | id=PID | Serial (before rest) | ~78 |
| ② | auth.getSession | — | — | Parallel | ~5 |
| ③ | tasks | id, title, status, description, due_date, priority, assignee_id, created_at, progress, task_labels(labels(...)), checklist_items(completed), comments(id), task_attachments(id), task_assignees(user_id) | project_id=PID, archived=null, order status, order position | Parallel | ~100* |
| ④ | get_workspace_members_with_email | — | p_workspace_id=WID | Parallel | ~46 |
| ⑤ | workspace_members | role | workspace_id=WID, user_id=UID | Parallel (chained) | ~5 |

### Calendar (3 server queries inside Suspense)

| # | Table / RPC | Columns | Filters | Parallel? | Avg (ms) |
|---|---|---|---|---|---|
| ① | tasks | id, title, due_date, priority, assignee_id | project_id IN (...), due_date≠null, archived=null, status≠done | Parallel | ~50* |
| ② | get_workspace_members_with_email | — | p_workspace_id=WID | Parallel | ~46 |
| ③ | meetings | id, workspace_id, project_id, title, description, start_time, end_time, meeting_attendees(user_id) | workspace_id=WID, order start_time | Serial (after ②) | ~50* |

### Notes (1 server query inside Suspense)

| # | Table / RPC | Columns | Filters | Avg (ms) |
|---|---|---|---|---|
| ① | notes | id, workspace_id, project_id, type, title, body, created_by, created_at, updated_at | workspace_id=WID, order updated_at desc | ~48 |

### Activity (3 server queries inside Suspense)

| # | Table / RPC | Columns | Filters | Parallel? | Avg (ms) |
|---|---|---|---|---|---|
| ① | tasks | id, title, project_id | project_id IN (...) | Serial | ~42 |
| ② | task_activity | id, event_type, metadata, created_at, actor_id, task_id | task_id IN (...), order created_at desc, limit 50 | Serial (after ①) | ~200 |
| ③ | get_workspace_members_with_email | — | p_workspace_id=WID | Serial (after ②) | ~46 |

---

## 9. Summary

| Metric | Value |
|---|---|
| Exact duplicate queries within same RSC render | **0** |
| Table-level overlap within same render | 1 (Dashboard `tasks` × 4 queries) |
| cache() hit rate | 100% (3/3 functions, ~124ms saved per render) |
| cache() misses | 0 |
| Unnecessary eager nesting | Yes — `comments(id)`, `task_attachments(id)` on Project page |
| Client-side re-fetch of server data | 1 — `getProjectMembers` in `KanbanBoard` |
| Data remapped and re-serialized | 1 — `workspace` → `workspaceSettings` (~200 bytes) |
| Most repeated data function | `get_workspace_members_with_email` RPC (4 pages + 5+ client calls) |
| Largest single Fetch cost | `task_activity LIMIT 10` (Dashboard: ~200ms, 25% of page render) |
| Overall verdict | **No wasteful duplicate fetches.** The existing cache() strategy correctly covers all cross-component duplication. Remaining inefficiencies are architectural (eager nesting, sequential batches, client re-fetch) rather than true duplicates. |

---

_Generated at 2026-07-07T08:47:00.000Z_
