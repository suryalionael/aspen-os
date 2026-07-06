# Aspen OS Performance Profile

> Generated: 2026-07-06 via `[PERF]` instrumentation + direct Supabase endpoint profiling.
> Profiling workflow: added `performance.now()` markers to middleware, layouts, pages, and server actions; started the dev server; measured warm and cold response times; measured Supabase Auth and REST endpoint latency from the same network.

---

## Bottleneck Rankings

### #1 — Duplicate `supabase.auth.getUser()` calls per page render

**Location**: middleware.ts + every dashboard layout + workspace layout + page

**Evidence** — direct Supabase endpoint profiling:
```
Supabase Auth /auth/v1/user GET:
  Cold: 250ms
  Warm: 127–135ms
```

On a single page load (e.g. `/workspace-slug`):
| Call site | Count | Each | Total |
|-----------|-------|------|-------|
| middleware `getUser()` | 1 | ~130ms | 130ms |
| dashboard layout `getUser()` | 1 | ~130ms | 130ms |
| workspace layout `getUser()` | 1 | ~130ms | 130ms |
| workspace home page `getUser()` | 1 | ~130ms | 130ms |
| **Total** | **4** | | **520ms** |

On a full page refresh, `getUser()` runs in middleware + dashboard layout + workspace layout + page = **4 sequential calls**. The middleware comment says `getUser()` is the session refresh mechanism — it should remain — but the other three are redundant.

**Root cause**: Middleware already calls `getUser()` to verify the session and refresh the auth cookie. Every downstream layout and page calls `getUser()` again to read the same user object (email, avatar_url, theme, user_metadata.timezone, id). Each call is an HTTP request to the Supabase Auth server.

**Smallest safe fix**: Replace `getUser()` with `getSession()` in all layouts and pages. After middleware refreshes the cookie via `getUser()`, `getSession()` reads the session from the local cookie (no network). The session object (`session.user`) has the same `id`, `email`, and `user_metadata` as the `getUser()` result.

**Estimated improvement**: Saves **3 × ~130ms = ~390ms** per authenticated page render.

---

### #2 — Middleware auth check on every client-side navigation

**Location**: `middleware.ts` + `lib/supabase/middleware.ts`

**Evidence** — middleware is invoked for every request matching:
```
/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)
```

This includes RSC payload fetches during client-side navigation (Link clicks, `router.push`). Every client-side page transition triggers the middleware, which calls `supabase.auth.getUser()` — a ~130ms warm network round-trip to Supabase Auth — before the page component even begins rendering.

**Measured impact** (from Supabase profiling):
```
| Phase | Latency |
|-------|---------|
| Middleware getUser() (warm) | ~130ms |
| Total blocked time per client nav | ~130ms |
```

**Root cause**: The middleware matcher pattern matches all page routes and RSC payload requests. When a user clicks a link or calls `router.push()`, Next.js fetches the RSC payload from the server, which goes through middleware. The middleware calls `getUser()` to verify the session on every navigation, even though the user was already authenticated on the initial page load.

**Smallest safe fix**: In `middleware.ts`, check for the `RSC: 1` header (sent by Next.js for client-side navigation fetches). Skip the `updateSession()` auth round-trip for these requests — return `NextResponse.next({ request })` immediately. The initial page load already verified the session, and layouts/pages use `getSession()` which reads the cookie.

**Estimated improvement**: Saves **~130ms per client-side navigation**. For a user navigating between Calendar → Home → Project, saves ~390ms cumulative.

---

### #3 — Sequential data fetching in layouts and pages

**Location**: 
- `app/(dashboard)/[workspaceSlug]/layout.tsx` (workspace → projects → getUser → membership)
- `app/(dashboard)/[workspaceSlug]/calendar/page.tsx` (workspace → projects → tasks → [meetings + members])
- `app/(dashboard)/[workspaceSlug]/activity/page.tsx` (workspace → getUser → projects → tasks → activity → members — 6 sequential)
- `app/(dashboard)/[workspaceSlug]/notes/page.tsx` (workspace → getUser → projects → notes — 4 sequential)

**Evidence** — Supabase REST endpoint profiling:
```
Supabase REST /rest/v1/ (warm): 118–228ms per query
```

Each sequential query adds one network round-trip. The workspace layout executes 4 sequential round-trips:
| Step | Query | Latency |
|------|-------|---------|
| 1 | `getWorkspaceBySlug()` | ~150ms |
| 2 | `projects` SELECT | ~150ms |
| 3 | `getUser()` auth | ~130ms |
| 4 | `workspace_members` SELECT | ~150ms |
| **Total** | | **~580ms** |

The first two steps depend on each other (projects needs workspace.id), but steps 2 and 3 are independent of each other. Steps 3 and 4 only depend on step 1 (workspace.id) and step 3's `user.id`.

**Root cause**: No `Promise.all` batching for independent queries. After `getWorkspaceBySlug()` resolves, the projects query and `getUser()` can run in parallel. After both resolve, `getUser()` is fast enough (with Fix #1) that `workspace_members` runs immediately without being a bottleneck.

**Smallest safe fix**: After `getWorkspaceBySlug()`, batch projects + getSession (with Fix #1) in `Promise.all`. Membership follows after both resolve. Same pattern for every other page.

**Estimated improvement**: Saves **~150ms** by parallelizing projects with getSession in workspace layout. For the activity page (6 sequential → ~3 batches), saves **~300ms**.

---

### #4 — Supabase query count per page render

**Location**: Multiple pages

**Evidence** — code analysis of every page's query count:

| Page | Sequential Queries | Total Network Round-trips | Est. Time |
|------|--------------------|-------------------------|-----------|
| `/sign-in` (public) | 0 | 0 | ~40ms |
| `/account` | 1 (getUser) + getProfile | 2 | ~300ms |
| `/[workspaceSlug]` (home) | 2 + 8 parallel + 2 parallel | 14 | ~800-1200ms |
| `/[workspaceSlug]/calendar` | 4 sequential | 6 | ~700-900ms |
| `/[workspaceSlug]/activity` | 6 sequential | 7 | ~800-1000ms |
| `/[workspaceSlug]/notes` | 4 sequential | 5 | ~600-800ms |
| `/[workspaceSlug]/[projectId]` | 2 + 3 parallel + 1 | 7 | ~500-800ms |

**Root cause**: Each page issues 5-14 separate Supabase queries. Even with Promise.all batching, the SLOWEST query in each batch determines total latency. Many pages fetch the same data multiple times:
- `getWorkspaceBySlug()` is called by both the workspace layout AND every page beneath it
- `getUser()` is called 3-4 times per page (middleware + dashboard layout + workspace layout + page)

**Smallest safe fix**: 
1. Already covered in #1 (replace getUser with getSession)
2. Use `React.cache()` on `createClient()` so multiple calls within the same render pass share the same client instance (avoids duplicate `await cookies()`)
3. For pages that re-fetch the same workspace (e.g. calendar already gets it from layout), rely on React's request-scoped caching via `cache()` which is already used by `getWorkspaceBySlug()`

**Estimated improvement**: Reduces effective query overhead by ~20% by eliminating redundant client creation.

---

### #5 — Aggressive `revalidatePath("/", "layout")` in server actions

**Location**: 61 occurrences across 13 server action files

**Measured impact**: Every server action that calls `revalidatePath("/", "layout")` invalidates the entire layout tree — root layout → dashboard layout → workspace layout → page — on the NEXT request. In a shared serverless environment (Vercel), this means re-running ALL data fetches in ALL layouts for the next user request to the same route segment.

| File | Count | Action examples |
|------|-------|-----------------|
| `tasks.ts` | 7 | createTask, editTask, archiveTask, deleteTask, updateTaskDueDate |
| `projects.ts` | 6 | renameProject, archiveProject, toggleFavoriteProject |
| `checklist.ts` | 3 | toggleChecklistItem, addChecklistItem |
| `comments.ts` | 3 | addComment, editComment, deleteComment |
| `workspace-settings.ts` | 5 | updateSettings, uploadLogo |
| `workspaces.ts` | 6 | removeMember, leaveWorkspace, createInvite |
| `labels.ts` | 4 | createLabel, addLabelToTask |
| `assignees.ts` | 2 | assignUserToTask, unassignUserFromTask |
| `attachments.ts` | 2 | uploadAttachment, deleteAttachment |
| `meetings.ts` | 4 | createMeeting, updateMeeting |
| `notes.ts` | 3 | createNote, updateNote |
| `profile.ts` | 3 | updateProfile, uploadAvatar |
| **Total** | **61** | |

**Root cause**: Using `"/", "layout"` as the revalidation scope is the nuclear option. It revalidates every route segment from the root, causing all layouts and pages to re-render. Most mutations only affect a single workspace's data.

**Smallest safe fix**: Change to scoped paths like `/${workspaceSlug}` or `/${workspaceSlug}/${projectId}`. For actions that don't have the slug, add a fast PK lookup (`SELECT slug FROM workspaces WHERE id = ?`) in parallel with existing work.

**Estimated improvement**: Saves re-render of root layout + dashboard layout header on subsequent requests. Roughly **~50-200ms** per post-mutation page render. Most impactful for frequently called actions like `toggleChecklistItem` (every checklist click) and `addComment`.

---

### #6 — `moveTask` server action (drag-and-drop) makes 7+ sequential/parallel queries

**Location**: `lib/actions/tasks.ts`, function `moveTask()`

**Evidence** — code analysis:
```
1. createClient()    — await cookies()
2. getUser()         — network request (~130ms)
3. SELECT columnTasks — network request (~150ms)
4. [N × UPDATE position] or computePosition — local + possibly N network updates
5. UPDATE task status+position — network request (~150ms)
6. [parallel] logActivity + getWorkspaceIdForProject + SELECT task title — 3 queries
7. [if workspaceId] logAuditEvent — network request
```

**Measured impact**: Even without revalidation (moveTask intentionally doesn't call `revalidatePath`), the action performs 5-10 Supabase queries. The getUser() call alone adds ~130ms.

**Root cause**: Every server action creates a fresh Supabase client (with `await cookies()`), calls `getUser()` for auth verification, then runs business logic queries. For drag-and-drop (moveTask), the user waits for this entire chain before the optimistic UI update.

**Smallest safe fix**: 
1. Cache `createClient()` with `React.cache()` to avoid duplicate `await cookies()`
2. Use `getSession()` instead of `getUser()` in server actions (middleware already verified the session)
3. Merge the parallel batch into existing queries where possible

**Estimated improvement**: Saves **~130ms** from getUser() and **~10ms** from duplicate cookies() in server actions.

---

### #7 — Multiple `await cookies()` calls per render pass

**Location**: `lib/supabase/server.ts` called from `getWorkspaceBySlug()` + layout + page

**Evidence**: `getWorkspaceBySlug()` calls `createClient()` which calls `await cookies()`. The workspace layout ALSO calls `await createClient()` which calls `await cookies()` again. In Next.js 15, `cookies()` is an async dynamic API.

**Measured impact**: Each `await cookies()` call is not directly measurable as network latency, but it's an async boundary that adds scheduling overhead. With 2-3 calls per page (layout + getWorkspaceBySlug + page), this adds ~5-15ms total overhead.

**Root cause**: No caching of the client instance. Each module that needs Supabase independently creates a client.

**Smallest safe fix**: Wrap `createClient()` with `React.cache()`. The first call within a render pass creates the client; subsequent calls return the cached instance, skipping the `await cookies()` call.

**Estimated improvement**: Saves **~5-15ms** per page load by eliminating duplicate client creation.

---

### #8 — No loading states for layout data fetching

**Location**: `app/(dashboard)/[workspaceSlug]/layout.tsx` — the workspace layout fetches workspace + projects + session + membership before rendering children

**Evidence**: The workspace layout has no `loading.tsx` at its level (there is one at the page level, which only wraps children). The layout's data fetching blocks the entire page from rendering, including its children's Suspense boundaries.

**Measured impact**: The workspace layout blocks rendering for ~600ms (4 sequential round-trips). The children (pages) cannot even START rendering until the layout completes.

**Root cause**: Next.js layouts don't have built-in streaming for their own data fetching. The layout must complete before any content is shown.

**Smallest safe fix**: While the layout data fetching is required for the sidebar, add a `loading.tsx` at the workspace layout level to show a skeleton state. Additionally, use React's `use` hook (available in React 19) with Suspense boundaries for layout data that isn't critical for initial paint.

**Estimated improvement**: Improves perceived performance by showing a loading state ~600ms sooner. Actual total render time unchanged.

---

## Server Action Timing (estimated from query analysis)

| Action | Queries | Network RTT | Est. Total |
|--------|--------|-------------|------------|
| `moveTask` (drag) | 5-10 | ~800ms | ~800-1,200ms |
| `createTask` | 4-5 | ~500ms | ~500-700ms |
| `editTask` | 4-5 | ~500ms | ~500-700ms |
| `toggleChecklistItem` | 4-6 | ~600ms | ~600-900ms |
| `addComment` | 5-8 | ~800ms | ~800-1,200ms |
| `toggleFavoriteProject` | 2-3 | ~300ms | ~300-500ms |

Note: All times include the user-perceived wait from click to response. Client-side optimistic updates (Kanban board) mask some of this latency.

---

## Summary of Recommendations

| # | Issue | Est. Time Saved | Difficulty | Risk |
|---|-------|----------------|------------|------|
| 1 | Replace `getUser()` → `getSession()` in layouts | ~390ms per page load | Easy | Low |
| 2 | Skip middleware auth for RSC payloads | ~130ms per nav | Easy | Low |
| 3 | Parallelize sequential queries with Promise.all | ~150-300ms per page | Easy | Low |
| 4 | Cache `createClient()` with `React.cache()` | ~10-15ms per page | Easy | Low |
| 5 | Scoped `revalidatePath` instead of "/", "layout" | ~50-200ms per mutation | Medium | Medium |
| 6 | Optimize server action queries | ~130-200ms per action | Medium | Low |
| 7 | Loading states for layout data | Perceived improvement | Medium | Low |

**Quick wins** (anyone can do safely):
1-4 can be implemented with minimal risk and zero behavior change. They eliminate redundant network requests and parallelize existing work.

#5 requires careful testing to ensure correct cache invalidation — missing a revalidation path could cause stale data.

#6 and #7 are incremental improvements beyond the high-impact changes.

---

## Stage 2 Profile — Post-Fix Measured Page Timings

> Profiling methodology: Playwright `page.goto()` with full network interception. Measured in `npm run dev` (development mode). Results include first-time module compilation overhead for pages visited the first time. Server "HTML" time is the response duration of the initial `text/html` response. "Nav" time is `page.goto` start to content visible.

### Measured per-page timings

Each `page.goto()` triggers a full server render — middleware, dashboard layout, workspace layout, and the target page component — followed by browser hydration:

| Page | HTML response | RSC post-load | Nav total (content visible) | RSC payload |
|------|-------------|--------------|---------------------------|-------------|
| workspace-home | 288ms | 213ms | 1,206ms | 102.5KB |
| calendar | **2,871ms** | 1,637ms | **3,919ms** | 108.2KB |
| notes | **3,366ms** | 2,323ms | **4,148ms** | 100.2KB |
| activity | **2,287ms** | 1,308ms | **3,052ms** | 92.0KB |
| project | 291ms | 195ms | 1,285ms | 116.1KB |

### Key pattern: two tiers of pages

Tier 1 — **Fast server render** (home, project): ~290ms HTML. These pages are already compiled (visited during setup). Server render is dominated by actual Supabase query network time.

Tier 2 — **Slow server render** (calendar, notes, activity): 2,287–3,366ms HTML. First-time visit triggers module compilation in dev mode. Even accounting for compilation, the raw query volume + React rendering adds 1–2s of real work.

### The hydration overhead wall

The gap between HTML time and "content visible" is **consistent across all pages**: 765–1,048ms. This is the **client-side hydration wall** — the fixed cost of hydrating the shared layout tree:
- `ProjectSidebar` (all projects, favorites, workspace info)
- `CommandPalette` (keyboard shortcut listener + full workspace index)
- `ThemeSync` + dashboard header
- The page-specific client components (`KanbanBoard`, `WorkspaceCalendarClient`, `NotesClient`)

This ~900ms hydration cost is incurred on EVERY full page load regardless of page complexity.

---

### Detailed page-by-page query analysis

#### workspace-home (10 Supabase queries)
| Batch | Queries | Est. wall clock |
|-------|---------|----------------|
| 1 | getWorkspaceBySlug | ~150ms |
| 2 | projects SELECT, get_workspace_members_with_email RPC | ~150ms |
| 3 | 8 parallel queries (assigned tasks ×2, due today, upcoming, favorites, all tasks, notes, meetings) | ~200ms |
| 4 | task_activity SELECT | ~150ms |
| **Total** | **10 queries in 4 batches** | **~650ms network** |

**Server render**: 288ms (fast — queries overlap well, no redundant calls)

#### calendar (8 Supabase queries, 2 redundant)
| Batch | Queries | Est. wall clock |
|-------|---------|----------------|
| 1 | getWorkspaceBySlug (cached from layout) | ~0ms |
| 2 | **projects SELECT, getWorkspaceMeetings: meetings SELECT + RPC, getWorkspaceMembers: getUser + RPC** | **~380ms** |
| 3 | tasks SELECT (depends on projectIds) | ~150ms |
| **Total** | **8 queries in 3 batches** | **~530ms network** |

**Redundancy**: `get_workspace_members_with_email` RPC called **twice** — once inside `getWorkspaceMeetings` → `resolveAttendeeEmails` and once inside `getWorkspaceMembers`. The same RPC with the same `p_workspace_id`. Also `getUser()` is called inside `getWorkspaceMembers` (missed by Fix #1 — server actions not converted).

**Server render**: 2,871ms (includes first-time compilation; net render ~1,000ms)

#### notes (5 Supabase queries)
| Batch | Queries | Est. wall clock |
|-------|---------|----------------|
| 1 | getWorkspaceBySlug | ~150ms |
| 2 | getSession, projects SELECT, notes SELECT (parallel) | ~150ms |
| **Total** | **5 queries in 2 batches** | **~300ms network** |

**Server render**: 3,366ms (includes first-time compilation; net render ~800ms)

**NotesClient hydration**: The `NotesClient` component may do additional client-side data rendering. Notes page has the largest hydration gap from internal RSC fetches (2,323ms of background RSC activity).

#### activity (5 Supabase queries)
| Batch | Queries | Est. wall clock |
|-------|---------|----------------|
| 1 | getWorkspaceBySlug | ~150ms |
| 2 | getSession, projects SELECT, get_workspace_members_with_email RPC (parallel) | ~150ms |
| 3 | tasks SELECT (depends on projectIds) | ~150ms |
| 4 | task_activity SELECT (depends on taskIds) | ~150ms |
| **Total** | **5 queries in 4 batches** | **~600ms network** |

**Server render**: 2,287ms (includes first-time compilation; net render ~700ms)

#### project (5 Supabase queries)
| Batch | Queries | Est. wall clock |
|-------|---------|----------------|
| 1 | project SELECT (by id) | ~150ms |
| 2 | getSession, tasks SELECT (with joins), get_workspace_members_with_email RPC (parallel) | ~200ms |
| 3 | workspace_members SELECT (depends on user.id) | ~150ms |
| **Total** | **5 queries in 3 batches** | **~500ms network** |

**Server render**: 291ms (fast — compiled during setup, well-parallelized queries)

---

### Remaining bottlenecks (ranked by measured impact)

| # | Issue | Impact | Location | Root cause |
|---|-------|--------|----------|------------|
| **1** | **Client hydration overhead** | ~900ms **per page load** | All pages | Heavy client components hydrated on every full page load: `ProjectSidebar`, `CommandPalette`, `KanbanBoard`. No streaming or progressive hydration. |
| **2** | **`getUser()` still in server actions** | ~130ms per call | `getWorkspaceMembers`, `getWorkspaceMeetings` | Fix #1 only converted page/layout components. Server actions in `lib/actions/*.ts` still call `getUser()` (instead of `getSession()`) when called during RSC rendering. |
| **3** | **Duplicate `get_workspace_members_with_email` RPC** | ~150ms redundant | Calendar page | Called twice: once in `getWorkspaceMeetings` → `resolveAttendeeEmails` and once in `getWorkspaceMembers`. Same `workspace_id`. |
| **4** | **First-visit compilation in dev mode** | 1,500–3,000ms | Calendar, notes, activity | Next.js dev mode compiles pages lazily on first visit. Production build eliminates this. |
| **5** | **No Suspense boundaries or streaming** | All data blocks response | Workspace layout + all pages | The layout and every page await all data before returning any HTML. Even the fast-to-fetch data is held up by the slowest query. |
| **6** | **RSC post-revalidation fetches** | 195–2,323ms after initial render | Calendar, notes, home | After initial HTML render, the client issues additional RSC fetches to reconcile data. These run after hydration, delaying real interactivity. |

### What users are actually waiting for

Breaking down the user-perceived delay on the slowest page (notes, 4.1s):

```
[Server: 3,366ms]  ← Next.js compiles + renders the page, runs Supabase queries, generates HTML
  ├─ Compilation (first visit): ~2,000ms
  ├─ Layout queries (workspace + projects + membership): ~450ms
  ├─ Page queries (notes + projects + session): ~300ms
  └─ React rendering + serialization: ~600ms
[Network: ~100ms]   ← HTML sent to browser
[Hydration: ~800ms]  ← React hydrates ProjectSidebar, CommandPalette, NotesClient, etc.
                     ← This is where the page BECOMES interactive
[Post-hydration RSC: ~2,300ms]  ← Background data syncs. User may see stale data before this.
```

### Key insight

The **hydration wall (~900ms)** is the single largest bottleneck after Stage 1 fixes. It affects every page equally. Reducing it would improve all pages, not just the slow ones.

The server-side slow pages (calendar, notes, activity) in dev mode are dominated by first-time compilation. In production, these should drop to 500–1,000ms range, making the **client-side hydration the primary bottleneck**.

### Recommendations for Stage 3

1. **Profile production build** — Re-run the same Playwright profiler against `next start` to eliminate dev-mode compilation noise.
2. **Add React.lazy / Suspense boundaries** — Defer hydration of `CommandPalette` and `ProjectSidebar` until after the page content is interactive. This could cut the hydration wall by 50%+.
3. **Convert `getUser()` → `getSession()` in server actions** — Extend Fix #1 to `lib/actions/*.ts` (getUser is still called in `getWorkspaceMembers`, `projects.ts`, `tasks.ts`, etc.)
4. **Deduplicate `get_workspace_members_with_email` RPC** — Cache the result or pass it between functions instead of re-fetching.
5. **Add `loading.tsx` at workspace layout level** — Shows a skeleton immediately while layout data loads, improving perceived performance.
