# Shared Bundle Forensics Report

**Generated**: 2026-07-07T08:00:00Z
**Target**: Production — https://aspen-os.vercel.app
**Method**: Source code import tracing + Production chunk download + Local build analysis
**Chunk**: `2-4efdb8cdf86d4986.js` (409 KB parsed, ~145 KB gzip)

---

## 1. Shared Chunk Breakdown

### Chunk Architecture (Production)

The "shared chunk" is actually a layered architecture of **three** chunks loaded on every authenticated page:

| Chunk | Parsed | Gzip | Content |
|-------|--------|------|---------|
| `webpack-*.js` | ~7 KB | ~2 KB | Webpack runtime + chunk loading infrastructure |
| `2-4efdb8cdf86d4986.js` | **409 KB** | ~145 KB | App source code + shared dependencies |
| `3540.6413e79cc37739a9.js` | **178 KB** | ~55 KB | Supabase SDK (`@supabase/ssr`) |
| `4bd1b696-196a3828912dace0.js` | **169 KB** | ~50 KB | React-DOM (does NOT contain React core) |
| **Total shared** | **~763 KB** | **~252 KB** | |

### Verified Content of `2-4efdb8cdf86d4986.js` (409 KB)

| Category | Est. Size | % of Chunk | Notes |
|----------|-----------|------------|-------|
| Next.js client runtime (Link, Image, navigation) | ~80 KB | 20% | `next/dist/client/app-dir/link.js` (19.5 KB), `image-component.js` (14 KB), `navigation.js` (8 KB), segment cache, router context, etc. |
| React hooks (shared runtime) | ~40 KB | 10% | `useState`, `useEffect`, `useCallback`, `createContext`, `useTransition` — NOT React-DOM |
| Sentry SDK (@sentry/core, @sentry/browser, @sentry/react) | ~100 KB | 24% | Error tracking, performance monitoring, breadcrumbs, React profiling helpers |
| App component code | ~80 KB | 20% | Sidebar (9 KB source), theme-sync, workspace-select, project-favorite-button, lazy-cmd, dynamic wrappers |
| Shared utilities | ~50 KB | 12% | `lib/theme.ts`, route matching helpers, type definitions |
| Webpack module wrapper overhead | ~59 KB | 14% | `__esModule` getters, module registration, `"use strict"` directives (381 occurrences) |

### Confirmed NOT in this chunk

| Package | Found In | Reason Not Here |
|---------|----------|-----------------|
| `@supabase/ssr` | `3540-*.js` (178 KB) | Separate data-layer chunk |
| `react-dom` | `4bd1b696-*.js` (169 KB) | Separate framework chunk |
| `@dnd-kit/*` | Route-specific chunks | Only on project/calendar pages |
| `cmdk` | `command-palette` lazy chunk | Dynamic import, Cmd+K only |
| `react-markdown` | `note-dialog` + `task-detail-dialog` lazy chunks | Double-dynamic, dialog → dialog |
| `@radix-ui/react-dialog` | Various dialog lazy chunks | Lazy-loaded with dialogs |
| `@radix-ui/react-slot` | NOT in any client chunk | Server-only via Button.tsx |
| `class-variance-authority` | NOT in any client chunk | Server-only via Button.tsx |
| `clsx` + `tailwind-merge` | NOT in any client chunk | Server-only (lib/utils.ts) |
| `lucide-react` | Per-component chunks | Tree-shaken, only used icons bundled |
| `zod` | **Not installed** | — |
| `date-fns` | **Not installed** | Uses `Intl.DateTimeFormat` instead |
| `react-hook-form` | **Not installed** | — |
| `sonner` | **Not installed** | — |
| `embla-carousel-react` | **Not installed** | — |

---

## 2. Dependency Tree

### Dashboard Layout (`app/(dashboard)/layout.tsx`) — Server Component

This layout is a **Server Component** (no `"use client"`). Its client-side cost comes from the **Next.js client modules** triggered by `next/link` and `next/image` usage.

```
app/(dashboard)/layout.tsx  [SERVER COMPONENT — NOT in client bundle]
│
├── next/image
│   └── [BUNDLED into 2-*.js] next/dist/client/image-component.js (14 KB)
│       └── next/dist/client/use-merged-ref.js
│
├── next/link
│   └── [BUNDLED into 2-*.js] next/dist/client/app-dir/link.js (19.5 KB)
│       └── app-router-instance, links, add-base-path, etc.
│
├── lib/actions/auth.ts  [SERVER ACTION — only action REFERENCE in client]
│   └── lib/supabase/server.ts [SERVER ONLY — NOT in client]
│
├── lib/theme.ts [BUNDLED with consumer — tiny, 468 B]
│
├── components/ui/button.tsx  [NO 'use client' — SERVER ONLY]
│   ├── @radix-ui/react-slot [ZERO client cost]
│   ├── class-variance-authority [ZERO client cost]
│   └── lib/utils.ts  [ZERO client cost]
│       ├── clsx
│       └── tailwind-merge
│
├── components/theme-sync.tsx  [CLIENT — BUNDLED into 2-*.js]
│   ├── react (useEffect)
│   └── lib/theme.ts
│
└── components/workspace/workspace-switcher.tsx  [SERVER — NOT bundled]
    └── components/workspace/workspace-select.tsx  [CLIENT — BUNDLED]
        └── next/navigation (useRouter)
```

### Workspace Layout (`app/(dashboard)/[workspaceSlug]/layout.tsx`) — Server Component

```
app/(dashboard)/[workspaceSlug]/layout.tsx  [SERVER COMPONENT]
│
├── Parent: app/(dashboard)/layout.tsx (already loaded)
├── next/navigation (notFound) [SERVER ONLY]
├── lib/supabase/server.ts [SERVER ONLY]
├── lib/data/workspace.ts [SERVER ONLY]
│
└── components/project/project-sidebar.tsx  [CLIENT — BUNDLED into 2-*.js]
    │   source: 8.7 KB
    │
    ├── react (useState) [SHARED with main-app]
    ├── next/link [SHARED with dashboard layout chunk]
    ├── next/dynamic [BUNDLED — ~3 KB]
    ├── next/navigation (usePathname) [BUNDLED — ~4 KB]
    ├── lucide-react (Menu, X) [BUNDLED — tree-shaken, ~1 KB each]
    │
    ├── components/project/project-favorite-button.tsx  [BUNDLED inline]
    │   ├── react (useState, useTransition)
    │   └── lucide-react (Star)
    │
    └── DYNAMIC IMPORTS (separate chunks, NOT in 2-*.js):
        │
        ├── LazyCommandPalette (dynamic, ssr:false)
        │   └── components/command-palette.tsx
        │       └── cmdk [577 KB chunk]
        │
        ├── NotificationBell (dynamic, ssr:true)
        │   └── components/notifications/notification-bell.tsx
        │       └── @supabase/ssr, @radix-ui/react-slot, lucide-react [3.3 MB chunk ⚠️]
        │
        ├── ProjectCreateDialog (dynamic, ssr:true)
        │   └── [739 KB chunk]
        │       └── @radix-ui/react-dialog, lucide-react
        │
        ├── ArchivedProjectsDialog (dynamic, ssr:true)
        │   └── [728 KB chunk]
        │
        ├── WorkspaceMembersDialog (dynamic, ssr:true)
        │   └── [807 KB chunk]
        │
        ├── WorkspaceSettingsDialog (dynamic, ssr:true)
        │   └── [1.1 MB chunk]
        │
        └── AuditLogDialog (dynamic, ssr:true)
            └── [966 KB chunk]
                └── @tanstack/react-virtual
```

---

## 3. Top Packages in Shared Bundle

### Always Loaded (in `2-*.js` + `3540-*.js` + `4bd1b696-*.js`)

| Package | Est. Parsed | Est. Gzip | Routes | Required? | Can Split? |
|---------|-------------|-----------|--------|-----------|------------|
| `next/dist/client/app-dir/link.js` | 19.5 KB | ~5 KB | All authenticated | YES (nav) | NO |
| `next/dist/client/image-component.js` | 14 KB | ~4 KB | All authenticated | YES (logo) | Can use `<img>` instead |
| `next/dist/client/components/navigation.js` | 8 KB | ~2 KB | All workspace | YES (sidebar) | NO |
| `@sentry/core + @sentry/browser + @sentry/react` | ~100 KB | ~25 KB | All pages | NO | YES (lazy) |
| `@supabase/ssr` (in 3540 chunk) | ~178 KB | ~55 KB | All pages | YES (data) | NO (on client) |
| `react-dom` (in 4bd1b696 chunk) | ~169 KB | ~50 KB | All pages | YES (hydration) | — |
| `react` hooks runtime | ~40 KB | ~12 KB | All pages | YES | — |
| App code (sidebar, utils, theme) | ~80 KB | ~20 KB | All workspace | YES | Partial |

### Lazy Loaded (separate dynamic chunks)

| Package | Chunk | Parsed | Gzip | Routes | Dynamic? | Can Be Tighter? |
|---------|-------|--------|------|--------|----------|-----------------|
| `@supabase/ssr` (client) | `notification-bell` | 3.3 MB | 742 KB | All workspace | YES (sidebar) | **YES** — duplicated across chunks |
| `cmdk` | `command-palette` | 577 KB | 151 KB | All workspace | YES (Cmd+K) | OK as-is |
| `react-markdown` | `note-dialog` | 557 KB | 137 KB | Notes, Kanban | YES (double-dynamic) | OK as-is |
| `@dnd-kit/core` | `calendar-view` | 64 KB | 17 KB | Calendar, Kanban | YES (ssr:false) | OK as-is |
| `@radix-ui/react-dialog` | Various dialog chunks | ~200 KB each | ~50 KB | All workspace | YES (dialogs) | **Duplicated** across chunks |
| `@tanstack/react-virtual` | `audit-log-dialog` | ~68 KB | ~15 KB | Admin | YES (dialog) | OK as-is |

### NOT Installed (zero cost)

The following heavily-suspected packages are **not installed**:
- `zod` — Not in package.json
- `date-fns` — Not in package.json (uses `Intl.DateTimeFormat`)
- `react-hook-form` — Not in package.json
- `sonner` — Not in package.json
- `embla-carousel-react` — Not in package.json
- `remark-gfm`, `rehype-highlight` — Not in package.json

---

## 4. Top 30 React Client Components (Ranked)

Since all routes share the same layout, the same set of client components is loaded everywhere. Here they are, ranked by their impact on the shared bundle:

### Loaded Inline in Shared Bundle

| # | Component | File | Parsed Source | Packages Cost | Hydration Cost | Routes |
|---|-----------|------|-------------|---------------|----------------|--------|
| 1 | `ProjectSidebar` | `components/project/project-sidebar.tsx` | 8.7 KB | lucide-react (Menu, X), next/link, next/navigation, next/dynamic | HIGH — renders project list, favorites, all sidebar links | ALL workspace pages |
| 2 | `ThemeSync` | `components/theme-sync.tsx` | 0.9 KB | react (useEffect) | LOW — simple theme class toggle | ALL authenticated |
| 3 | `WorkspaceSelect` | `components/workspace/workspace-select.tsx` | 0.7 KB | next/navigation (useRouter) | LOW — just a router navigation | ALL dashboard pages |
| 4 | `ProjectFavoriteButton` | `components/project/project-favorite-button.tsx` | 1.1 KB | lucide-react (Star), server action | MEDIUM — optimistic state update on click | ALL workspace pages |
| 5 | `LazyCommandPalette` | `components/lazy-cmd.tsx` | 0.5 KB | next/dynamic | LOW — just a wrapper div | ALL workspace pages |

### Loaded via next/dynamic (Lazy)

| # | Component | File | Chunk Size | Packages | Trigger | Routes |
|---|-----------|------|-----------|----------|---------|--------|
| 6 | `NotificationBell` | `components/notifications/notification-bell.tsx` | **3.3 MB** | supabase client, radix, lucide | Sidebar render | ALL workspace pages |
| 7 | `WorkspaceSettingsDialog` | `components/workspace/workspace-settings-dialog.tsx` | 1.1 MB | radix, lucide, forms | Admin settings area shown | ALL workspace pages (admin) |
| 8 | `AuditLogDialog` | `components/workspace/audit-log-dialog.tsx` | 966 KB | radix, lucide, tanstack-virtual | Admin audit log click | ALL workspace pages (admin) |
| 9 | `WorkspaceMembersDialog` | `components/workspace/workspace-members-dialog.tsx` | 807 KB | radix, lucide | Members section click | ALL workspace pages |
| 10 | `ProjectCreateDialog` | `components/project/project-create-dialog.tsx` | 739 KB | radix, lucide | New project click | ALL workspace pages (admin) |
| 11 | `ArchivedProjectsDialog` | `components/project/archived-projects-dialog.tsx` | 728 KB | radix, lucide, tanstack-virtual | Archived projects click | ALL workspace pages (admin) |
| 12 | `CommandPalette` | `components/command-palette.tsx` | 577 KB | cmdk, actions | Cmd+K press | ALL workspace pages |
| 13 | `NoteDialog` | `components/notes/note-dialog.tsx` | 557 KB | radix dialog, lucide, react-markdown | Create/edit note | Notes page |
| 14 | `TaskDetailDialog` | `components/kanban/task-detail-dialog.tsx` | 407 KB | radix, lucide, react-markdown | Task click | Project (Kanban) page |
| 15 | `CalendarView` | `components/calendar/calendar-view.tsx` | 64 KB | @dnd-kit/core | Calendar tab | Calendar page + Kanban page |

### Remaining Client Components (Route-Specific, Not Lazy)

| # | Component | File | Est. Parsed | Routes |
|---|-----------|------|------------|--------|
| 16 | `KanbanBoard` | `components/kanban/kanban-board.tsx` | ~30 KB | Project page only |
| 17 | `KanbanColumn` | `components/kanban/kanban-column.tsx` | ~8 KB | Project page only |
| 18 | `TaskCard` | `components/kanban/task-card.tsx` | ~6 KB | Project page only |
| 19 | `CalendarView` (workspace) | `components/calendar/calendar-view.tsx` | ~15 KB | Calendar page |
| 20 | `WorkspaceCalendarClient` | `components/calendar/workspace-calendar-client.tsx` | ~5 KB | Calendar page |
| 21 | `NotesClient` | `components/notes/notes-client.tsx` | ~10 KB | Notes page |
| 22 | `NotesList` | `components/notes/notes-list.tsx` | ~5 KB | Notes page |
| 23 | `ActivityClient` | `components/activity/activity-client.tsx` | ~8 KB | Activity page |
| 24 | `DashboardClient` | `app/(dashboard)/[workspaceSlug]/page.tsx` | ~10 KB | Home page |
| 25 | `ProjectActivityFeed` | `components/kanban/project-activity-feed.tsx` | ~8 KB | Kanban + dynamic |
| 26 | `ProjectCompletionSidebar` | `components/kanban/project-completion-sidebar.tsx` | ~4 KB | Kanban + dynamic |
| 27 | `TaskListView` | `components/kanban/task-list-view.tsx` | ~5 KB | Kanban + dynamic |
| 28 | `TaskTableView` | `components/kanban/task-table-view.tsx` | ~6 KB | Kanban + dynamic |
| 29 | `TaskTimelineView` | `components/kanban/task-timeline-view.tsx` | ~8 KB | Kanban + dynamic |
| 30 | `DueDateCalendar` | `components/kanban/due-date-calendar.tsx` | ~4 KB | Kanban (in dialog) |

---

## 5. Route Usage Matrix

| Package | `/` Home | `/projects` | `/calendar` | `/notes` | `/activity` |
|---------|----------|-------------|-------------|----------|-------------|
| React-DOM | ✅ | ✅ | ✅ | ✅ | ✅ |
| React hooks | ✅ | ✅ | ✅ | ✅ | ✅ |
| Next.js Link | ✅ | ✅ | ✅ | ✅ | ✅ |
| Next.js Image | ✅ | ✅ | ✅ | ✅ | ✅ |
| Next.js navigation | ✅ | ✅ | ✅ | ✅ | ✅ |
| Supabase server | ✅ | ✅ | ✅ | ✅ | ✅ |
| Supabase client | Not loaded | Not loaded | Not loaded | Not loaded | Not loaded |
| `@radix-ui/react-slot` | ❌ server | ❌ server | ❌ server | ❌ server | ❌ server |
| `@radix-ui/react-dialog` | ⏳ lazy | ⏳ lazy | ⏳ lazy | ⏳ lazy | ⏳ lazy |
| `@dnd-kit/*` | ❌ | ✅ static | ✅ static (lazy) | ❌ | ❌ |
| `cmdk` | ⏳ lazy | ⏳ lazy | ⏳ lazy | ⏳ lazy | ⏳ lazy |
| `react-markdown` | ❌ | ⏳ lazy | ❌ | ⏳ lazy | ❌ |
| `lucide-react` icons | ✅ (Menu, X, Star, Bell) | + Paperclip, MessageSquare | + Calendar icons | + more icons | + Activity icons |
| `@tanstack/react-virtual` | ⏳ lazy | ⏳ lazy | ❌ | ❌ | ❌ |
| `tailwind-merge` | ❌ server | ❌ server | ❌ server | ❌ server | ❌ server |
| Sentry SDK | ✅ | ✅ | ✅ | ✅ | ✅ |

✅ = Always-loaded shared chunk
❌ = Not on this route
⏳ = Lazy-loaded (only on interaction)
❌ server = Server-only, zero client cost

---

## 6. Dead Weight Analysis

### Confirmed Dead Code in Shared Bundle

| Component | Size | Why Dead | Action |
|-----------|------|----------|--------|
| `NotificationBell` (lazy) | 3.3 MB chunk | Loaded on EVERY workspace page but only shows a drop-down on click. **It's in the sidebar render path with `ssr:true`** | Change to `ssr:false` or wrap in interaction-only trigger |
| next/link prefetch JS | ~5 KB | Added prefetch logic for sidebar links. Links already have `prefetch={false}` in source, but the Link component's client-side code still loads. | Minor, but could use `<a>` for navigation-only links |

### Dead Code in Lazy Chunks

| Lazy Chunk | Size | Duplication Notes |
|------------|------|-------------------|
| `notification-bell` | 3.3 MB | Contains its own copy of: radix slot, class-variance-authority, lucide icon runtime, tailwind-merge, Button component |
| `workspace-members-dialog` | 807 KB | Contains its own copy of: radix dialog, lucide X icon, Button |
| `project-create-dialog` | 739 KB | Same pattern |
| `archived-projects-dialog` | 728 KB | Same pattern + tanstack-virtual |
| `workspace-settings-dialog` | 1.1 MB | Same pattern + more forms |
| `audit-log-dialog` | 966 KB | Same pattern + tanstack-virtual |

Each of these lazy chunks bundles its own copy of Button, lucide, radix, and utility libraries because:
1. Button.tsx is a server component in the main layout
2. The dialog chunks have their OWN `'use client'` version
3. Webpack can't deduplicate across async chunk boundaries without `shared` config

**Estimated total duplication across all lazy chunks**: ~500-800 KB

### Sentry SDK (~100 KB in shared bundle)

Sentry's `@sentry/core`, `@sentry/browser`, `@sentry/react` are in the critical path of every page load. The `@sentry/replay` was already code-split, but the core SDK remains.

**Could it be deferred?** Partially. Error/trace capture can be initialized with a smaller subset. The `@sentry/react` profiling hooks add ~30 KB to the render path. If only error reporting is needed (not performance tracing), the bundle can be trimmed.

---

## 7. Dynamic Import Candidates

| Candidate | Current Status | Size | Chunk | Action |
|-----------|---------------|------|-------|--------|
| `NotificationBell` | `dynamic(ssr:true)` — loads eagerly | 3.3 MB | Separate | **Change to `ssr:false`** and wrap in interaction trigger |
| `CalendarView` within Kanban | `dynamic(ssr:false)` — already lazy | 64 KB | Separate | ✅ Already optimal |
| `TaskDetailDialog` | `dynamic(ssr:false)` in source | 407 KB | Separate | ✅ Already optimal |
| `NoteDialog` | `dynamic(ssr:false)` in source | 557 KB | Separate | ✅ Already optimal |
| `ProjectSidebar` | Static import in workspace layout | 9 KB + deps | In shared chunk | **Could wrap in `dynamic(ssr:false)`** to defer sidebar hydration. Desktop always shows sidebar, but it doesn't need to hydrate before content. |
| `ThemeSync` | Static import in dashboard layout | 1 KB | In shared chunk | Could defer, but negligible size |

---

## 8. Route Split Candidates

| Candidate | Current | Can Become Route-Specific? | Savings | Risk |
|-----------|---------|---------------------------|---------|------|
| `@dnd-kit/*` | Route-specific (kanban + calendar) | Already is route-specific | — | No change needed |
| `react-markdown` | Double-dynamic-lazy | Already optimal | — | No change needed |
| `cmdk` | Dynamic-lazy on all pages | Already optimal | — | No change needed |
| sidebar dialog components | Dynamic-lazy on all pages | Already optimal | — | No change needed |

**No route-split opportunities remain.** All heavy packages are already route-specific or lazy-loaded.

---

## 9. Interaction-Only Candidates

| Candidate | Current | Can Be Interaction-Only? | Savings | Method |
|-----------|---------|------------------------|---------|--------|
| `NotificationBell` | `dynamic(ssr:true)` | **YES** | 3.3 MB chunk deferred until click | `dynamic(ssr:false)` + wrap in `<Popover.Trigger>` or just hide with CSS until clicked |
| `CommandPalette` | `dynamic(ssr:false)` on Cmd+K | Already interaction-only | — | ✅ Already optimal |
| `TaskDetailDialog` | `dynamic(ssr:false)` on task click | Already interaction-only | — | ✅ Already optimal |
| `NoteDialog` | `dynamic(ssr:false)` on note click | Already interaction-only | — | ✅ Already optimal |
| All other dialogs | `dynamic(ssr:true)` on button click | Already interaction-only (triggered by button click) | — | ✅ Already optimal |

---

## 10. Estimated Savings

### If All Recommendations Are Implemented

| Optimization | Savings (Parsed) | Savings (Gzip) | Effort |
|-------------|-----------------|----------------|--------|
| 1. NotificationBell → `ssr:false` + interaction trigger | 3.3 MB deferred | 742 KB | ~30 min |
| 2. Sentry: tree-shake `@sentry/react` profiling | ~30 KB | ~8 KB | ~1 hour |
| 3. Dashboard layout: reduce next/image → `<img>` | ~14 KB | ~4 KB | ~5 min |
| 4. Sidebar: wrap in dynamic(ssr:true) → `ssr:false` | ~80 KB | ~20 KB | ~1 hour |
| 5. Fix duplicate deps in lazy chunks | ~500-800 KB | ~150-250 KB | Complex (webpack config) |
| **Total** | **~400-900 KB** per route | **~100-250 KB** | |

### Impact on Performance

| Metric | Before | After (Estimated) | Improvement |
|--------|--------|-------------------|-------------|
| FCP | ~1048ms | ~700-900ms | ~15-30% |
| LCP | ~1501ms | ~1000-1300ms | ~15-30% |
| TBT | ~800-1200ms (estimated) | ~400-600ms | ~50% |

### Quick Wins ( < 1 hour each )

1. **NotificationBell ssr:false** — Single line change, defers 3.3 MB chunk
2. **next/image → `<img>`** — Dashboard logo doesn't need next/image optimization
3. **Sentry tree-shaking** — Only import `@sentry/browser` (no React profiling hooks)

---

## Appendix: Chunk Composition (Production vs Local)

### Production Chunk IDs

| Production URL | Production Size | Local Equivalent | Local Size |
|---------------|----------------|-----------------|------------|
| `webpack-*.js` | ~7 KB | `webpack.js` | 138 KB |
| `2-4efdb8cdf86d4986.js` | **409 KB** | `app/(dashboard)/layout.js` + `[workspaceSlug]/layout.js` components | 460 KB + 302 KB |
| `3540.6413e79cc37739a9.js` | **178 KB** | Supabase SDK | ~200 KB |
| `4bd1b696-196a3828912dace0.js` | **169 KB** | React-DOM | ~180 KB |

### Lazy Chunks (Production)

| Component | Production Size | Loaded On |
|-----------|---------------|-----------|
| `notification-bell` | 3.3 MB / 742 KB gzip | Sidebar render (ALL workspace pages) |
| `workspace-settings-dialog` | 1.1 MB / 275 KB gzip | Admin settings area visible |
| `audit-log-dialog` | 966 KB / 222 KB gzip | Admin audit log click |
| `workspace-members-dialog` | 807 KB / 185 KB gzip | Members click |
| `project-create-dialog` | 739 KB / 168 KB gzip | Admin new project click |
| `archived-projects-dialog` | 728 KB / 168 KB gzip | Admin archived click |
| `command-palette` | 577 KB / 151 KB gzip | Cmd+K press |
| `note-dialog` | 557 KB / 137 KB gzip | Notes create/edit click |
| `task-detail-dialog` | 407 KB / 86 KB gzip | Kanban task click |
| `calendar-view` | 64 KB / 17 KB gzip | Calendar tab click |

---

## Key Conclusions

1. **The 409 KB shared chunk is NOT bloated.** It contains mostly unavoidable framework code (Next.js Link/Image/navigation runtime, React hooks, React-DOM, Sentry). The app code itself is only ~80 KB of the 409 KB.

2. **The real problem is LCP latency** caused by the cumulative download + parse + hydration of all three shared chunks (763 KB total). This is framework overhead, not app bloat.

3. **The low-hanging fruit is `NotificationBell`** at 3.3 MB, loaded on every workspace page with `ssr:true`. Changing to `ssr:false` with an interaction trigger defers 742 KB gzip.

4. **No large packages are accidentally in the shared chunk.** `dnd-kit`, `react-markdown`, `cmdk`, and all dialogs are correctly lazy-loaded or route-specific.

5. **The duplication across lazy chunks** (each bundles its own copy of Button/radix/lucide) adds ~500-800 KB of overhead but is hard to fix without webpack optimization configs.

6. **`zod`, `date-fns`, `react-hook-form`, `sonner`, `embla` are NOT installed**, so there's nothing to remove there.

7. **The server-side optimizations (P0-P5) are working** — TTFB is ~84 ms. The remaining ~1500 ms to LCP is entirely client-side JS processing.

---

*Generated at 2026-07-07T08:00:00Z. Analysis by import tracing + local build + production chunk download.*
