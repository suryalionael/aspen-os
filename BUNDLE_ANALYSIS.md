# Bundle Analysis

Generated: Jul 7, 2026 (production build)
Tool: `@next/bundle-analyzer` + `webpack-bundle-analyzer`

---

## Bottom Line

**649 KB gzipped** for the first load. That's too large — target is <300 KB. The main culprits:

| Issue | Impact (parsed) | Fix |
|---|---|---|
| **react-dom duplicated** | ~348 KB (109 KB gzip) | Code-split the non-critical copy |
| **Supabase SDK single chunk** | ~182 KB (51 KB gzip) | Tree-shake unused modules, use lazy auth |
| **Unknown 124 KB chunk** | ~124 KB (39 KB gzip) | Identify and split |
| **Markdown/parse lib** | ~115 KB (34 KB gzip) | Dynamic import on the page that needs it |
| **App router runtime** | ~420 KB (129 KB gzip) | Hard to reduce (Next.js own code) |

---

## Bundle Overview

| Metric | Value |
|---|---|
| Total chunks | 66 |
| Total stat size | 6,284 KB |
| Total parsed size | **2,064 KB** |
| Total gzip size | **649 KB** |
| Shared/runtime | ~1,696 KB parsed (82%) |
| Page-specific | ~368 KB parsed (18%) |

## Largest Chunks

| Chunk | Parsed | Gzip | Contents |
|---|---|---|---|
| `2432-ab8b9a8cd98e1828.js` | 420 KB | 129 KB | Next.js app router runtime |
| `main-25b6ad189eab9684.js` | 407 KB | 127 KB | Next.js main bundle (client components, router) |
| `framework-f649a9856fefcb0d.js` | 190 KB | 60 KB | React 19 (174 KB react-dom) |
| `3540-6413e79cc37739a9.js` | **182 KB** | **51 KB** | **Supabase SDK** (gotrue, realtime, functions, storage) |
| `4bd1b696-196a3828912dace0.js` | **173 KB** | **54 KB** | **Second copy of react-dom** |
| `4a7b0c69-c28b3c0d6d42b12c.js` | **124 KB** | **39 KB** | Large utility bundle (index.js 124 KB) |
| `8836.3386d1acde34a21a.js` | **115 KB** | **34 KB** | Parser/markdown library stack |
| `44530001-5b21dfd34f884005.js` | 63 KB | 13 KB | GoTrueClient.js (Supabase auth) |
| `249-7ff805c0fce97d09.js` | 47 KB | 15 KB | `@next/third-parties` + utilities |
| `[projectId]/page.js` | 38 KB | 11 KB | Project page (kanban, dialogs) |

## Critical Issue: react-dom Duplication

`react-dom-client.production.js` is included **twice** in the client bundle:

| Location | Parsed | Gzip |
|---|---|---|
| `framework-f649a9856fefcb0d.js` | 174,667 B | 54,899 B |
| `4bd1b696-196a3828912dace0.js` | 172,938 B | 54,194 B |
| **Total duplicated** | **347,605 B** | **109,093 B** |

This is likely caused by React 19's client-only features being bundled separately from the server framework chunk. The two copies differ by only ~1,700 B.

## Supabase SDK Impact

| Package | Parsed | Gzip |
|---|---|---|
| GoTrueClient.js | 62,426 B | 13,144 B |
| GoTrueAdminApi.js | 8,096 B | 1,611 B |
| RealtimeChannel.js | 7,479 B | 2,090 B |
| RealtimeClient.js | 6,369 B | 1,780 B |
| FunctionsClient.js | 3,102 B | 867 B |
| Other | 94,307 B | 31,296 B |
| **Total Supabase** | **181,779 B** | **50,788 B** |

Everything is in a single chunk (`3540-6413e79cc37739a9.js`). No code-splitting or lazy loading is happening for Supabase modules.

## Largest React Components

| Component | Parsed | Gzip | Notes |
|---|---|---|---|
| `button.tsx` | 25 KB | 13 KB | Appears in 20 chunks — heavily duplicated |
| `dialog.tsx` | 21 KB | 8 KB | In 10 chunks |
| `calendar-view.tsx` | 14 KB | 5 KB | — |
| `kanban-board.tsx` | 14 KB | 4 KB | Now lazy-loaded |
| `task-detail-dialog.tsx` | 9 KB | 2 KB | — |
| `input.tsx` | 8 KB | 5 KB | In 14 chunks |
| `audit-log-dialog.tsx` | 6 KB | 2 KB | — |
| `meeting-dialog.tsx` | 6 KB | 2 KB | — |
| `workspace-settings-dialog.tsx` | 5 KB | 2 KB | Now lazy-loaded |
| `workspace-members-dialog.tsx` | 5 KB | 2 KB | — |
| `project-sidebar.tsx` | 5 KB | 2 KB | — |
| `task-comments.tsx` | 5 KB | 1 KB | — |
| `command-palette.tsx` | 4 KB | 2 KB | — |

## Duplicated Component Analysis

These components appear in multiple chunks because they're imported directly rather than through a barrel/shared entry:

| Component | Chunks | Impact |
|---|---|---|
| `button.tsx` | 20 | 25 KB total parsed |
| `dialog.tsx` | 10 | 21 KB total parsed |
| `input.tsx` | 14 | 8 KB total parsed |
| `textarea.tsx` | 6 | 3 KB total parsed |
| `createLucideIcon.js` | 5 | Small per-chunk, adds up |
| `Icon.js` | 5 | Small per-chunk, adds up |

These are `shadcn/ui` primitives. They're small but the duplication adds up. Consider a shared-components chunk for primitives used in 5+ pages.

## Page-Specific Bundle Sizes

| Page | Parsed | Gzip |
|---|---|---|
| `/projectId` (project page) | 38 KB | 11 KB |
| `/account` | 11 KB | 4 KB |
| `/calendar` | 10 KB | 4 KB |
| `/notes` | 9 KB | 3 KB |
| `/sign-in` | 4 KB | 2 KB |
| `/sign-up` | 4 KB | 2 KB |
| `/forgot-password` | 4 KB | 2 KB |
| `/invite/[token]` | 4 KB | 2 KB |
| `/update-password` | 4 KB | 2 KB |
| `/workspaces/new` | 4 KB | 2 KB |
| `/activity` | 1 KB | 0.4 KB |

## Previous Optimizations Applied

| Date | Change | Saved |
|---|---|---|
| Jul 7, 2026 | Lazy-loaded `kanban-board.tsx` | ~14 KB parsed |
| Jul 7, 2026 | Lazy-loaded `workspace-calendar-client.tsx` | ~2 KB parsed |
| Jul 7, 2026 | Lazy-loaded `notes-client.tsx` | ~3 KB parsed |
| Jul 7, 2026 | Lazy-loaded `workspace-settings-dialog.tsx` | ~5 KB parsed |

## Next Optimization Opportunities (Ranked)

### P1 — Critical (high impact, low effort)

1. **Fix react-dom duplication** — investigate why `4bd1b696` gets a separate copy and configure webpack to share it
2. **Supabase code-splitting** — lazy-import `@supabase/supabase-js` on routes that need auth rather than bundling it all upfront. The auth client alone is 62 KB parsed.
3. **Identify and split the 124 KB chunk** (`4a7b0c69`) — this is a large `index.js` bundle that needs to be identified and dynamically imported on the pages that use it.

### P2 — Medium

4. **Split the 115 KB parser chunk** (`8836.3386`) — appears to be a markdown/rich-text parser. Only needed on notes and task descriptions pages. Dynamic import.
5. **De-duplicate shadcn/ui primitives** with a shared vendor chunk for `button.tsx`, `dialog.tsx`, `input.tsx`, `textarea.tsx` to avoid 20x duplication.
6. **Audit `@next/third-parties`** — the 47 KB chunk (`249-7ff805c0fce97d09.js`) is primarily this package with `core.esm.js` (39 KB). Used for Google Analytics / GTM. Consider lazy-loading or removing.

### P3 — Nice to have

7. **Tree-shake Supabase** — remove `GoTrueAdminApi.js` (8 KB, server-only), `FunctionsClient.js` (3 KB, not used). They're in the client bundle unnecessarily.
8. **Audit Icon library imports** — `createLucideIcon.js`, `Icon.js` appear 5 times. Use direct icon imports instead of barrel imports.
