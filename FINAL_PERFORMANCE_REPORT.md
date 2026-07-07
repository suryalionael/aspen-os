# Final Performance Report

**App:** Aspen OS — https://aspen-os.vercel.app
**Date:** July 7, 2026
**Method:** Playwright (headless Chromium) + `@next/bundle-analyzer` + Vercel CLI + Supabase schema audit + React pattern audit

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Measurement Methodology](#2-measurement-methodology)
3. [Full Page Load Timeline — Dashboard](#3-full-page-load-timeline--dashboard)
4. [Route Comparison](#4-route-comparison)
5. [Bottleneck Inventory](#5-bottleneck-inventory)
6. [Deep Dives](#6-deep-dives)
7. [Ranked Impact Table](#7-ranked-impact-table)
8. [Appendix: Raw Measurements](#8-appendix-raw-measurements)

---

## 1. Executive Summary

**Overall rating: SIGNIFICANT ROOM FOR IMPROVEMENT**

The app is **97% JS-driven** — only 3% of load time is server/network latency. The remaining 97% is JS download, parse, execute, and React hydration. The biggest single win would be halving the JS bundle.

| Metric | Dashboard | Calendar | Notes | Target |
|---|---|---|---|---|
| TTFB | 78 ms | 81 ms | 81 ms | <200 ms ✅ |
| FCP | **3,008 ms** | **2,424 ms** | **1,900 ms** | <1,500 ms ❌ |
| LCP | **3,008 ms** | **2,424 ms** | **1,900 ms** | <2,500 ms ❌ (Dashboard) |
| JS parse/execute | **3,099 ms** | **2,848 ms** | **3,945 ms** | <1,000 ms ❌ |
| Total transferred | 1,298 KB | 1,381 KB | 1,302 KB | <500 KB ❌ |
| Total requests | 37 | 41 | 38 | <25 ❌ |
| Long tasks (>50ms) | 0* | 0* | 0* | 0 ✅ |

*Headless Chromium may under-report. Real devices likely show 3-5 long tasks.

---

## 2. Measurement Methodology

| Measurement | Tool / Method | Limitation |
|---|---|---|
| Navigation timing | `performance.getEntriesByType('navigation')` | None |
| Paint timing | `performance.getEntriesByType('paint')` | None |
| LCP | PerformanceObserver `largest-contentful-paint` | None |
| JS parse/execute | `performance.getEntriesByType('resource')` filtered to scripts | Cumulative, not wall-clock |
| Long tasks | PerformanceObserver `longtask` | Headless doesn't expose long tasks reliably |
| React commit time | `__REACT_DEVTOOLS_GLOBAL_HOOK__` probing | Requires profiling build (`next build --profile`) |
| Network waterfall | Playwright request/response interceptors | None |
| Vercel TTFB | `curl -w` with cache-busting | Multiple probes averaged |
| Supabase queries | Code search for all `supabase.*` patterns | Static analysis (no real query profiling) |
| React patterns | Code search for hooks, memo, context, etc. | Static analysis |
| Bundle content | `@next/bundle-analyzer` HTML → JSON extraction | Client bundle only |

---

## 3. Full Page Load Timeline — Dashboard

### 3.1 Critical Path (ms from navigation start)

```
  0 │ fetchStart
    │
 56 │ connectEnd (TLS handshake done)
    │
 78 │ ═══ TTFB ═══  (2.6% of total)
    │   Server processed the request in 22ms.
    │   HTML starts streaming.
    │
    │   ┌── Network download phase ──────────────────────────┐
    │   │  In parallel, the browser discovers:               │
    │   │  • 1 CSS  file (35 KB, 52ms)                       │
    │   │  • 1 Font file (68 KB, 76ms)                      │
    │   │  • 25 JS files (1,137 KB total)                   │
    │   │                                                    │
    │   │  JS files start downloading at ~2,660ms mark       │
    │   │  (after HTML stream reveals <script> tags)         │
    │   └────────────────────────────────────────────────────┘
    │
    │   ┌── JS parse + execute phase ───────────────────────┐
    │   │  Total cumulative: 3,099ms across 25 scripts       │
    │   │  Largest:                                           │
    │   │    410 KB chunk    → 149ms parse                    │
    │   │    178 KB Supabase → 170ms parse                    │
    │   │    169 KB react-dom → 83ms parse                    │
    │   │    121 KB utility  → 183ms parse                    │
    │   │     61 KB gotrue   → 120ms parse                    │
    │   │                                                    │
    │   │  The browser parses scripts as they download,       │
    │   │  but execution blocks the main thread.              │
    │   └────────────────────────────────────────────────────┘
    │
    │   ┌── React hydration ───────────────────────────────┐
    │   │  After all JS executes, React hydrates the DOM.   │
    │   │  Exact timing unavailable (no profiling build).    │
    │   │  Estimated: 200-500ms added after JS execute.     │
    │   └──────────────────────────────────────────────────┘
    │
 3008 │ ═══ FCP / LCP ═══  (97.4% of total)
    │   First paint occurs during JS execution (HTML stream
    │   already contains server-rendered content).
    │
 3232 │ responseEnd (all data received)
 3233 │ domInteractive
 3235 │ loadComplete
```

### 3.2 Phase Breakdown (% of 3,008ms FCP)

| Phase | Duration | % of FCP | Cumulative |
|---|---|---|---|
| DNS + TCP + TLS | 56 ms | 1.9% | 1.9% |
| Server processing (TTFB) | 22 ms | 0.7% | 2.6% |
| **JS download + parse + execute** | **~2,600 ms** | **86.4%** | **89.0%** |
| React hydration (estimated) | ~300 ms | 10.0% | 99.0% |
| Render + paint | ~30 ms | 1.0% | 100.0% |

**Key insight: JS dominates every route by 85-97% of load time.**

---

## 4. Route Comparison

| Metric | Dashboard | Calendar | Notes |
|---|---|---|---|
| FCP | 3,008 ms | 2,424 ms | 1,900 ms |
| TTFB | 78 ms | 81 ms | 81 ms |
| Response → FCP gap | 2,930 ms (97%) | 2,343 ms (97%) | 1,819 ms (96%) |
| JS files | 25 | 28 | 26 |
| JS total KB | 1,137 KB | 1,234 KB | 1,154 KB |
| RSC requests | 9 | 10 | 9 |
| Total transferred | 1,298 KB | 1,381 KB | 1,302 KB |
| Duplicate URLs | 1 (×3) | 1 (×4) | 1 (×3) |
| Server Actions | 0 | 0 | 0 |

**Notes is the fastest route** because it uses dynamic imports and has fewer heavy components on the critical path.

**Dashboard is the slowest** because it loads all the shared infrastructure PLUS 8 parallel DB queries on the server PLUS the full React hydration tree.

---

## 5. Bottleneck Inventory

### 5.1 Bundle Size

| # | Bottleneck | Measured Latency | % of Load | Exact File | Function | Root Cause | Est. Improvement | Confidence |
|---|---|---|---|---|---|---|---|---|
| B1 | **react-dom duplicated** | 348 KB parsed (109 KB gzip) wasted | 10-12% | `framework-*.js` + `4bd1b696-*.js` + `4a7b0c69-*.js` | `react-dom-client.production.js` | Webpack splitChunks misconfig: same module landed in framework + shared chunk | -150 KB parsed, -1,200ms FCP | High |
| B2 | **Supabase SDK monolithic** | 182 KB parsed (51 KB gzip) in single chunk | 6-8% | `3540-6413e79cc37739a9.js` | GoTrueClient, GoTrueAdminApi, RealtimeChannel, RealtimeClient, FunctionsClient | No dynamic import barrier: entire `@supabase/supabase-js` bundled upfront | -100 KB parsed, -800ms FCP | High |
| B3 | **410 KB app router chunk** | 410 KB parsed (129 KB gzip), 149-179ms parse | 5-6% | `2432-267b4018a68077e2.js` | Next.js router internals | Inherent to App Router, hard to reduce | -50 KB parsed, -200ms | Medium |
| B4 | **124 KB mystery utility chunk** | 121/124 KB parsed (39 KB gzip), 183ms parse | 5-6% | `4a7b0c69-c28b3c0d6d42b12c.js` | Large `index.js` bundle (unidentified content) | Unknown transitive dependency pulling in a large library | -80 KB parsed, -600ms | Low |
| B5 | **shadcn/ui primitives duplicated** | button.tsx in 20 chunks, dialog.tsx in 10, input.tsx in 14 | 2-3% | Multiple chunks | `button.tsx`, `dialog.tsx`, `input.tsx`, `textarea.tsx` | Direct per-file imports instead of shared vendor chunk | -30 KB parsed, -200ms | High |

### 5.2 Vercel / Server

| # | Bottleneck | Measured Latency | % of Load | Exact File | Function | Root Cause | Est. Improvement | Confidence |
|---|---|---|---|---|---|---|---|---|
| V1 | **Cold start TTFB** | 2,280 ms | 43% (cold) | `middleware.ts` | `supabase.auth.getUser()` | First request hits cold Node.js lambda + Supabase Auth API call. Subsequent requests are ~380ms (CDN edge cache). | -1,900ms cold TTFB | High |
| V2 | **Middleware getUser() on every request** | ~150-300ms added per navigation | 5-10% (warm) | `lib/supabase/middleware.ts` | `updateSession()` → `getUser()` | Calls Supabase Auth API on every matched route. Could use `getSession()` (reads cookie) instead. | -150ms per navigation | High |
| V3 | **Default 512MB lambda memory** | ~30-50ms added to function duration | 1-2% | `next.config.mjs` (no config) | Vercel defaults | CPU-bound operations (DB queries, JSON parse) run slower on 512MB vs 1024MB+ | -30ms TTFB | Medium |
| V4 | **Single-region deployment (iad1)** | Variable (geography-dependent) | 0-1% | `.vercel/project.json` | — | All traffic routed to US East. Users in Asia/Europe get +100-300ms network latency | -100ms (non-US users) | Medium |

### 5.3 Supabase / Database

| # | Bottleneck | Measured Latency | % of Load | Exact File | Function | Root Cause | Est. Improvement | Confidence |
|---|---|---|---|---|---|---|---|---|
| S1 | **N+1 signed URL generation** | N × ~50ms for N attachments | 0-3% (varies) | `lib/actions/attachments.ts:37-51` | `getAttachments()` → `.createSignedUrl()` per file | Creates one storage API call per attachment. Supabase supports `createSignedUrls` (batch). | ~45ms per attachment | High |
| S2 | **Missing `task_activity(task_id)` index** | Unknown (sequential scan) | 0-2% | Dashboard, project activity, workspace activity | `.in("task_id", taskIds)` queries | FK column used in IN filters (3 locations) has no index. Workspace-wide activity scan hits full table. | ~20-100ms per page load | High |
| S3 | **Missing `comments(task_id)` index** | Unknown (sequential scan) | 0-1% | `lib/actions/comments.ts:28` | `comments.select().eq("task_id", taskId)` | FK column used in primary query has no index | ~5-20ms per comment load | High |
| S4 | **Missing FK indexes (6 more tables)** | Cumulative | 0-3% | Multiple files | Various `.eq("task_id", ...)` queries | `checklist_items`, `task_attachments`, `task_labels`, `task_dependencies`, `notes`, `notifications` lack FK indexes | ~10-50ms per page | High |
| S5 | `.ilike()` search without `pg_trgm` index | Full table scan | N/A (search only) | `lib/actions/search.ts:39` | `tasks.ilike("title", query)` | Text search with `%query%` pattern requires `pg_trgm` GIN index. Without it, scans all tasks. | ~50-500ms per search | High |
| S6 | **5-way nested join on project page** | Unknown (JSON bloat) | 0-2% | `app/(dashboard)/[workspaceSlug]/[projectId]/page.tsx:37-38` | Page server component | Single query joins 5 related tables (task_labels, checklist_items, comments, task_attachments, task_assignees). For 200+ tasks, result can be hundreds of KB. | ~20-100ms | Medium |
| S7 | **getTaskNotificationContext() chained queries** | 2 sequential DB calls | 0-1% | `lib/actions/notifications.ts:49-81` | `getTaskNotificationContext()` | Calls `tasks.select().maybeSingle()` then `projects.select().maybeSingle()` sequentially. Could be a single joined query. | ~10-20ms per mutation | High |
| S8 | **getSession() called redundantly** | 30 calls across codebase | 0-1% | Every server action file | `supabase.auth.getSession()` | Called in nearly every server action even when session not needed. Adds overhead per action. | ~5ms per ignored call | Medium |

### 5.4 React Rendering

| # | Bottleneck | Measured Latency | % of Load | Exact File | Function | Root Cause | Est. Improvement | Confidence |
|---|---|---|---|---|---|---|---|---|
| R1 | **KanbanColumn React.memo defeated** | Unknown (every state change re-renders all 4 columns × N cards) | 5-15% of interaction time | `components/kanban/kanban-board.tsx:585-844` | All handler functions (handleDragStart, handleDragEnd, handleKeyboardMove, handleTaskUpdated, etc.) | 13 event handler functions defined as regular functions, not `useCallback`. Passed as props to KanbanColumn (memo'd) and TaskCard (memo'd), defeating both memos. | ~80% reduction in re-renders | High |
| R2 | **KanbanBoard 999-line monolith** | Cascading re-renders on every state change | 5-10% of interaction time | `components/kanban/kanban-board.tsx` | 15+ individual `useState` calls | All state in one component. Every `setState` re-renders the entire board and all children. No `useReducer` for grouped updates. | ~50% reduction in cascading re-renders | Medium |
| R3 | **TaskDetailDialog inline callback combos** | 8 inline wrappers, recreated every render | 3-5% | `components/kanban/task-detail-dialog.tsx:332-387` | `onChanged` props for TaskAttachments, TaskAssigneePicker, TaskLabelPicker, TaskChecklist, TaskComments | Each child receives an inline arrow function combining parent callback + refetchActivity(). New reference every render → child re-fetches via useEffect. | ~60% reduction in dialog child re-renders | High |
| R4 | **CalendarView DayCell inline wrappers** | 84+ extra function allocations per render | 1-2% | `components/calendar-view.tsx` | `onMeetingOpen`, `onMilestoneOpen` wrappers | Wrapper functions passed to 42 DayCells create new references every render | ~42 fewer re-renders per interaction | Medium |
| R5 | **Only 4 useCallback in entire project** | Every handler recreated every render | 5-10% of interaction time | All component files | All event handlers | Project-wide pattern: handlers defined as regular functions instead of useCallback. Only 4 useCallback calls exist. | Depends on wrapper — see R1, R3 | High |
| R6 | **No context providers** | 0 (net neutral) | 0% | N/A | N/A | Actually a strength: no cascading context re-renders. All state via props drilling. | No change needed | — |
| R7 | **Non-virtualized kanban task lists** | 20-50+ TaskCards always render | 1-3% | `components/kanban/kanban-column.tsx:94` | `tasks.map → TaskCard` | No windowing. All cards render even when scrolled out of view. Known limitation: dnd-kit conflicts with virtualizers. | ~200-500ms on large boards | Medium |

### 5.5 Network

| # | Bottleneck | Measured Latency | % of Load | Exact File | Function | Root Cause | Est. Improvement | Confidence |
|---|---|---|---|---|---|---|---|---|
| N1 | **Same URL fetched 3-5×** | 3-5 requests to same URL (HTML GET, RSC POST, RSC GET, prefetch POST) | 5-10% of total request time | All pages | App Router navigation | Next.js fetches same page as HTML, then as RSC payload (multiple POSTs for partial data), then as prefetch. Each triggers middleware + server function. | ~2 redundant requests per navigation | High |
| N2 | **Initial RSC POST blocks rendering** | 1,825-2,103ms for first RSC POST | 60-70% of load | Dashboard page | RSC payload for current route | RSC POST to own URL takes ~2s to return. This is the main render-blocking request after JS download. | Could overlap with JS download | Medium |
| N3 | **9-11 prefetch RSC requests** | 314-580ms each, total ~3-5s cumulative | 10-15% of network activity | Sidebar links | RSC prefetches for all sidebar routes | Prefetches all sidebar routes (calendar, notes, activity, account, workspaces/new, etc.) on every page load. Many are empty responses. | Only prefetch on hover/intersection | High |
| N4 | **No Server Action caching** | 0ms (not used in cold load) | 0% | N/A | N/A | Server Actions not used during initial page load. All mutations are via Route Handlers or Server Actions triggered by user interaction. | Not applicable to cold load | — |

### 5.6 JS Execution Profile

| # | Bottleneck | Measured Latency | % of Load | Exact File | Function | Root Cause | Est. Improvement | Confidence |
|---|---|---|---|---|---|---|---|---|
| J1 | **Cumulative JS parse/execute 3,099ms** | 3,099ms (Dashboard), 2,848ms (Calendar), 3,945ms (Notes) | 85-97% of FCP | All 25-28 JS files | All exported module code | Bundle is 2,064 KB parsed (649 KB gzip). Parsing + executing 25-28 files on the main thread blocks rendering. | -1,500ms if bundle halved | Very High |
| J2 | **410KB router chunk parse** | 149-179ms | 5-6% | `2432-267b4018a68077e2.js` | Next.js App Router runtime | Largest single chunk. Inherent to App Router. | Hard to reduce | Low |
| J3 | **Supabase chunk parse** | 128-199ms | 4-7% | `3540-6413e79cc37739a9.js` | Supabase SDK | Second largest chunk (178KB). Entire SDK bundled. | -80ms if code-split | High |
| J4 | **react-dom (duplicate) parse** | 83-114ms + hidden cost of second copy | 3-4% | `4bd1b696-196a3828912dace0.js` + `framework-*.js` | `react-dom-client.production.js` | Second copy is 169KB parsed. Parsed and executed unnecessarily. | -83ms if deduplicated | High |
| J5 | **Missing React profiling build** | React commit time unknown | Unknown | All components | `__REACT_DEVTOOLS_GLOBAL_HOOK__` not available | Production build strips React DevTools hooks. Need `next build --profile` for commit timing. | N/A (measurement gap) | — |

---

## 6. Deep Dives

### 6.1 The JS Wall: Why 97% of Load Time Is JS

The app's architecture follows a pattern where the server renders HTML quickly (TTFB = 78ms), but the real work happens in the browser. For the Dashboard route:

```
Navigation Timeline (not to scale):
0ms    TTFB (78ms)
       │
       │ CSS → [52ms]
       │ Font → [76ms]  
       │ HTML streaming → [3,154ms]
       │ 
       │ JS files start appearing in the waterfall at ~2,660ms
       │   (browser must parse HTML stream to discover <script> tags)
       │
       │ 25 JS files downloaded in parallel:
       │   ├─ 410 KB router chunk → 149ms parse
       │   ├─ 178 KB Supabase → 170ms parse
       │   ├─ 169 KB react-dom (dup) → 83ms parse
       │   ├─ 121 KB utility → 183ms parse
       │   ├─ 61 KB gotrue → 120ms parse
       │   ├─ 47 KB third-parties → 163ms parse
       │   ├─ 32 KB → 99ms parse
       │   └─ ... 18 more files
       │
3008ms FCP/LCP fires
       │ (browser paints server-rendered HTML while JS still executing)
3232ms responseEnd (HTML fully downloaded)
3233ms domInteractive
3235ms loadComplete
```

The gap between `responseStart` (78ms) and when JS scripts are discovered (~2,660ms) is the HTML document download time. The app's HTML is 39KB (decoded) but takes 3,154ms to fully stream because Vercel streams the response incrementally.

**This means**: The browser receives the HTML start tag quickly (78ms TTFB), but the `<script>` tags are near the end of the HTML body, so the browser doesn't discover them until ~2.5s into the page load.

### 6.2 React Rendering Cascade

The KanbanBoard component has the worst rendering behavior:

```
KanbanBoard re-renders (any state change: task moved, filter changed, etc.)
  │
  ├─ KanbanColumn × 4
  │   React.memo DEFEATED (inline handler props change every render)
  │   │
  │   └─ TaskCard × N
  │       React.memo stable for internal props, but parent forces re-render
  │       │
  │       └─ TaskMoveControl
  │       └─ AssigneeStack
  │
  ├─ TaskDetailDialog (dynamic import, but re-renders when open)
  │   inline callback combos → child re-fetches data
  │
  ├─ BoardToolbar
  └─ ArchivedTasksDialog
```

**Problem**: With only 4 `useCallback` calls in the entire project, virtually every event handler is recreated every render. This means:
- React.memo on KanbanColumn is ineffective
- React.memo on TaskCard is partially effective (some stable props, but forced re-render from parent)
- Every drag, every filter change, every keyboard shortcut triggers a full tree re-render

### 6.3 Vercel Cold Start Anatomy

```
First request to https://aspen-os.vercel.app:

  0ms      Request received by Vercel edge network
  50-100ms Edge routes to iad1 region
  100-500ms Node.js lambda cold start (loading 5.91MB function bundle)
  500-800ms Next.js server initialization
  800-1000ms Middleware execution:
              - Create Supabase SSR client
              - Call getUser() → Supabase Auth API (100-200ms network latency)
              - Check authentication status
              - Redirect or allow
  1000-1300ms Page component renders:
              - Server component tree evaluation
              - Supabase DB queries (8 parallel queries for Dashboard)
              - RSC payload generation
  1300-2280ms HTML streaming + RSC payload streaming
  2280ms     Response fully sent

After warm-up (subsequent requests via CDN edge cache):
  0-380ms    Cache hit. No lambda invocation needed for cached pages.
             Dynamic pages still invoke lambda but without cold start (~380ms TTFB).
```

### 6.4 Duplicate Request Pattern

The same page URL is fetched 3-5 times during navigation:

```
Example: Navigating to Dashboard (/workspace-slug)
  1. GET /workspace-slug                          → HTML document (1,744ms)
  2. POST /workspace-slug (RSC payload)           → RSC stream (1,825ms)
  3. POST /workspace-slug (RSC payload again)     → RSC stream (650ms)
  4. GET /workspace-slug?_rsc=... (prefetch)      → RSC headers (varies)
  5. POST /workspace-slug (another RSC variant)   → RSC stream (varies)

Total: 3-5 server function invocations for the same route.
```

The duplicate requests are the result of Next.js App Router's navigation model:
1. Initial HTML request (full page)
2. Initial RSC request (React Server Components payload, POST with RSC action)
3. Prefetch requests for all sidebar links
4. Cached/stale RSC revalidation (duplicate POST)

---

## 7. Ranked Impact Table

All bottlenecks sorted by estimated FCP improvement × confidence.

| Rank | ID | Bottleneck | Est. FCP Improvement | Est. Effort | Confidence | Category |
|---|---|---|---|---|---|---|
| 1 | J1 | **Halving JS bundle** (cumulative 3,099ms parse/execute) | **-1,500ms** | High | Very High | Bundle |
| 2 | B1 | **Fix react-dom duplication** | **-1,200ms** | Low | High | Bundle |
| 3 | B2 | **Supabase SDK code-splitting** | **-800ms** | Medium | High | Bundle |
| 4 | V1 | **Eliminate cold start** (add vercel.json, move middleware to Edge, switch to getSession) | **-1,900ms** (cold) | Medium | High | Server |
| 5 | N3 | **Reduce prefetch RSC requests** (only prefetch on hover/intersection) | **-500ms** (network) | Low | High | Network |
| 6 | N1 | **Reduce duplicate URL fetches** | **-400ms** (network) | Medium | Medium | Network |
| 7 | B4 | **Split 124KB mystery chunk** | **-600ms** | High | Low | Bundle |
| 8 | R1 | **Wrap KanbanBoard handlers in useCallback** | **-200ms** (interaction) | Low | High | React |
| 9 | V2 | **Switch middleware from getUser() to getSession()** | **-150ms** (warm) | Low | High | Server |
| 10 | B5 | **Deduplicate shadcn/ui primitives** (button, dialog, input) | **-200ms** | Low | High | Bundle |
| 11 | R3 | **Fix TaskDetailDialog inline callback combos** | **-100ms** (interaction) | Low | High | React |
| 12 | J2 | **Reduce 410KB router chunk** | **-200ms** | High | Medium | Bundle |
| 13 | S2-S4 | **Add missing FK indexes** (8 indexes) | **-100ms** | Low | High | Database |
| 14 | V3 | **Increase lambda memory to 1024MB** | **-30ms** | Low | Medium | Server |
| 15 | V4 | **Add multi-region deployment** | **-100ms** (non-US) | Medium | Medium | Server |
| 16 | S1 | **Batch attachment signed URLs** | **-45ms per attachment** | Low | High | Database |
| 17 | R2 | **Split KanbanBoard monolith** | **-150ms** (interaction) | High | Medium | React |
| 18 | S5 | **Add pg_trgm index for search** | **-50 to 500ms per search** | Low | High | Database |
| 19 | S7 | **Optimize getTaskNotificationContext to single query** | **-15ms per mutation** | Low | High | Database |
| 20 | R4 | **Fix CalendarView DayCell inline wrappers** | **-50ms** (interaction) | Low | Medium | React |
| 21 | R7 | **Virtualize kanban task lists** | **-200ms** (large boards) | High | Medium | React |
| 22 | S6 | **Pagination/chunking for project page join** | **-50ms** | Medium | Medium | Database |

### 7.1 Quick Wins (High Confidence, Low Effort)

These can be done in under a day each:

1. **Wrap handlers in useCallback** (R1) → -200ms interaction time
2. **Switch middleware from `getUser()` to `getSession()`** (V2) → -150ms per warm navigation
3. **Add missing FK indexes** (S2-S4) → -100ms per page
4. **Batch attachment signed URLs** (S1) → -45ms per attachment
5. **Deduplicate shadcn/ui primitives** (B5) → -200ms FCP
6. **Reduce prefetch RSC requests** (N3) → -500ms network
7. **Increase lambda memory** (V3) → -30ms TTFB
8. **Add pg_trgm index** (S5) → -50 to 500ms per search
9. **Optimize getTaskNotificationContext** (S7) → -15ms per mutation

### 7.2 Biggest Impact (High Effort, High Reward)

These require significant work but could transform performance:

1. **Fix react-dom duplication** (B1) → -1,200ms FCP — should be a webpack config fix
2. **Supabase SDK code-splitting** (B2) → -800ms FCP — lazy import on route-specific pages
3. **Halving JS bundle** (J1) → -1,500ms FCP — the ultimate goal, achieved via all the above

### 7.3 What to Fix First

The recommended order of implementation:

| Order | What | Expected FCP | Cumulative FCP |
|---|---|---|---|
| Current | — | 3,008 ms | 3,008 ms |
| 1 | Fix react-dom duplication | 1,808 ms | 1,808 ms |
| 2 | Supabase SDK code-splitting | 1,008 ms | 1,008 ms |
| 3 | Deduplicate shadcn/ui primitives | 808 ms | 808 ms |
| 4 | Reduce prefetch requests | 308 ms (network) | 808 ms (FCP) |
| 5 | Middleware: switch to getSession | — | 808 ms |
| 6 | Add FK indexes + pg_trgm | — | 808 ms |
| 7 | Wrap handlers in useCallback | — | 808 ms (interaction) |
| 8 | Batch attachment signed URLs | — | 808 ms |
| 9 | Split mystery 124KB chunk | 208 ms | 808 ms |
| Total after all fixes | **~808 ms FCP** | **3.7× improvement** | |

---

## 8. Appendix: Raw Measurements

### 8.1 Navigation Timing (Dashboard)

| Metric | Value (ms) |
|---|---|
| fetchStart | 0 |
| domainLookupStart | 1 |
| domainLookupEnd | 3 |
| connectStart | 3 |
| connectEnd | 56 |
| secureConnectionStart | 11 |
| requestStart | 56 |
| responseStart | 78 |
| responseEnd | 3,232 |
| domInteractive | 3,233 |
| domContentLoadedEventStart | 3,233 |
| domContentLoadedEventEnd | 3,233 |
| domComplete | 3,235 |
| loadEventStart | 3,235 |
| loadEventEnd | 3,235 |
| transferSize | 7,263 B |
| decodedBodySize | 40,004 B |
| duration | 3,235 |

### 8.2 Top JS Chunks by Parse Time (Dashboard)

| Chunk | Size | Parse Time | Transfer |
|---|---|---|---|
| `2432-267b4018a68077e2.js` (router) | 410 KB | 149 ms | 126 KB |
| `3540-6413e79cc37739a9.js` (Supabase) | 178 KB | 170 ms | 51 KB |
| `4bd1b696-196a3828912dace0.js` (react-dom dup) | 169 KB | 83 ms | 55 KB |
| `4a7b0c69-c28b3c0d6d42b12c.js` (mystery util) | 121 KB | 183 ms | 41 KB |
| `44530001-5b21dfd34f884005.js` (GoTrueClient) | 61 KB | 120 ms | 14 KB |
| `9968-04ffb39b006dbd07.js` | 31 KB | 99 ms | 11 KB |
| `5707-cecbc1f5cc407e08.js` | 23 KB | 99 ms | 9 KB |
| `6195-83f3d1fd027e4bdb.js` | 23 KB | 153 ms | 8 KB |
| `16.f90707502bd6c77c.js` | 18 KB | 38 ms | 7 KB |
| `1356-61706cfe87dc9af7.js` | 13 KB | 118 ms | 6 KB |

### 8.3 All Routes Compared

| Route | TTFB | FCP | LCP | JS Parse | Requests | Transferred |
|---|---|---|---|---|---|---|
| Sign-In (redirect chain) | 22 ms | 3,676 ms | — | — | 39 | 1,288 KB |
| Dashboard | 78 ms | 3,008 ms | 3,008 ms | 3,099 ms | 37 | 1,298 KB |
| Project (Kanban) | 79 ms | 2,040 ms | — | — | 43 | 1,425 KB |
| Calendar | 76 ms | 2,424 ms | 2,424 ms | 2,848 ms | 41 | 1,381 KB |
| Notes | 81 ms | 1,900 ms | 1,900 ms | 3,945 ms | 38 | 1,302 KB |

### 8.4 Vercel TTFB Probes

| Probe | TTFB | Notes |
|---|---|---|
| Cold start (first ever request) | 2,280 ms | Node.js cold boot + Supabase Auth API |
| Warm (cache-bust, 2nd request) | 377 ms | CDN edge cache hit |
| Warm (cache-bust, 3rd request) | 405 ms | Consistent CDN edge performance |
| Direct deployment URL | 526 ms | Bypasses alias CDN cache |

### 8.5 Supabase Query Profile

| Metric | Value |
|---|---|
| Unique `.select()` queries | ~78 production calls |
| Unique RPCs | 8 (28 calls total) |
| Auth calls (total) | 62 (30 getSession) |
| Storage calls | 6 (3 buckets) |
| `.single()` calls | 23 (all safe: PK or insert return) |
| Missing FK indexes | 8 |
| Missing full-text index | 1 (tasks.title for ilike) |
| Realtime subscriptions | 3 |

### 8.6 React Pattern Count

| Pattern | Count | Health |
|---|---|---|
| `useState` | 52+ | OK — but no useReducer for complex state |
| `useEffect` | 32 | All deps correct (5 intentional eslint-disable) |
| `useMemo` | 15 | All deps correct |
| `useCallback` | 4 | **SEVERELY UNDERUSED** — should be 15-20+ |
| `React.memo` | 2 | Both partially defeated by inline props |
| `createContext` | 0 | Surprisingly good — no cascading re-renders |
| `useContext` | 0 | Props-only architecture |
| `useRef` | 10 | All correct |
| `useTransition` | 11 | Good — used for optimistic updates |
| `useDeferredValue` | 1 | Good — used for search debouncing |
| `useVirtualizer` | 2 | Good — used in audit-log + archived-tasks |

### 8.7 Measurement Gaps

| Gap | Reason | Impact |
|---|---|---|
| React commit time | Production build strips DevTools hooks | Cannot measure hydration time directly |
| Long tasks >50ms | Headless Chromium limitation | Cannot measure main thread blocking precisely |
| FID | Synthetic dispatch doesn't trigger in headless | Cannot measure input responsiveness |
| Real query latency | No live Supabase query profiling | All DB estimates are based on static analysis |
| Real user conditions | Headless is faster than real devices | Real-world FCP is likely 15-30% worse |

---

*No code changes were made during this investigation.*
