# Frontend Performance Report

**Generated**: 2026-07-06T16:39:24.199Z
**Environment**: Production (https://aspen-os.vercel.app)
**Viewport**: 1440×900 @2x
**Device**: Playwright (Chromium, unbranded)

## Executive Summary

| Metric | Avg | Max | Min | Target |
|---|---|---|---|---|
| FCP | 1849ms | 2156ms | 1588ms | <1800ms |
| LCP | 1897ms | 2156ms | 1728ms | <2500ms |
| TBT | 0ms | 0ms | 0ms | <200ms |
| JS (uncompressed) | 1177KB | 1264KB | 1137KB | — |
| RSC payloads | 6KB | 13KB | 0KB | — |
| Requests | 39 | 43 | 37 | — |
| CLS | 0.000 avg | 0.000 | — | <0.1 |

## Per-Route Summary

| Route | FCP | LCP | TTFB | TBT | CLS | JS(KB) | JS files | RSC(KB) | RSC n | Reqs | LCP Element |
|---|---|---|---|---|---|---|---|---|---|---|
| Dashboard (My Work) | 1848ms | 1848ms | 78ms | 0ms | 0 | 1137KB | 25 | 13KB | 6 | 37 | H1.text-xl.font-semibold |
| Kanban Board | 1728ms | 1728ms | 79ms | 0ms | 0 | 1264KB | 29 | 5KB | 3 | 43 | P.max-w-prose.text-sm |
| Calendar | 1992ms | 1992ms | 131ms | 0ms | 0 | 1234KB | 28 | 0KB | 2 | 41 | SPAN.hidden.max-w-[160px] |
| Notes | 1784ms | 1784ms | 82ms | 0ms | 0 | 1154KB | 26 | 6KB | 5 | 38 | P.max-w-xs.text-sm |
| Activity | 1588ms | 1876ms | 84ms | 0ms | 0 | 1137KB | 25 | 6KB | 4 | 37 | P.max-w-xs.text-sm |
| Landing (sign-in) | 2156ms | 2156ms | 24ms | 0ms | 0 | 1137KB | 25 | 6KB | 1 | 39 | H1.text-xl.font-semibold |

## Navigation Timing

| Route | TTFB | DOM Interactive | DOM Content Loaded | Load Complete |
|---|---|---|---|---|
| Dashboard (My Work) | 78ms | 2481ms | 2481ms | 2481ms |
| Kanban Board | 79ms | 1692ms | 1692ms | 1898ms |
| Calendar | 131ms | 2534ms | 2535ms | 2558ms |
| Notes | 82ms | 1772ms | 1772ms | 2112ms |
| Activity | 84ms | 1848ms | 1849ms | 1876ms |
| Landing (sign-in) | 24ms | 2042ms | 2042ms | 2042ms |

## SPA Navigation Transitions

Measured by clicking sidebar links (not page.goto). Full client-side navigation within shared layout.

| Transition | Duration |
|---|---|
| Dashboard → Kanban | 1539ms |
| Kanban → Calendar | 1531ms |
| Calendar → Notes | 2723ms |
| Notes → Dashboard | 1845ms |

## Long Tasks Analysis

### Dashboard (My Work)
- No long tasks (>50ms) detected

### Kanban Board
- No long tasks (>50ms) detected

### Calendar
- No long tasks (>50ms) detected

### Notes
- No long tasks (>50ms) detected

### Activity
- No long tasks (>50ms) detected

### Landing (sign-in)
- No long tasks (>50ms) detected

## JavaScript Bundle Analysis

### Per-Route JS Stats

| Route | Total JS (KB) | Compressed (KB) | Files | Largest Chunk (KB) | Chunk Name |
|---|---|---|---|---|---|
| Dashboard (My Work) | 1137 | 1137 | 25 | 410 | 2432-267b4018a68077e2.js |
| Kanban Board | 1264 | 1264 | 29 | 410 | 2432-267b4018a68077e2.js |
| Calendar | 1234 | 1234 | 28 | 410 | 2432-267b4018a68077e2.js |
| Notes | 1154 | 1154 | 26 | 410 | 2432-267b4018a68077e2.js |
| Activity | 1137 | 1137 | 25 | 410 | 2432-267b4018a68077e2.js |
| Landing (sign-in) | 1137 | 1137 | 25 | 410 | 2432-267b4018a68077e2.js |

### All Unique JS Chunks (by size)

| Size (KB) | URL |
|---|---|
| 410 | `2432-267b4018a68077e2.js` |
| 178 | `3540-6413e79cc37739a9.js` |
| 169 | `4bd1b696-196a3828912dace0.js` |
| 121 | `4a7b0c69-c28b3c0d6d42b12c.js` |
| 61 | `44530001-5b21dfd34f884005.js` |
| 47 | `7541-5f1133fe98c9d53d.js` |
| 38 | `app/(dashboard)/%5BworkspaceSlug%5D/%5BprojectId%5D/page-307653fbc6f29` |
| 35 | `448-5c007a8b4e156052.js` |
| 31 | `9968-04ffb39b006dbd07.js` |
| 23 | `6195-83f3d1fd027e4bdb.js` |
| 23 | `5707-cecbc1f5cc407e08.js` |
| 18 | `16.f90707502bd6c77c.js` |
| 17 | `app/(dashboard)/%5BworkspaceSlug%5D/notes/page-8bd029047cdf967a.js` |
| 15 | `app/(dashboard)/%5BworkspaceSlug%5D/calendar/page-13a98d09db5559c8.js` |
| 13 | `1356-61706cfe87dc9af7.js` |
| 12 | `app/(dashboard)/%5BworkspaceSlug%5D/layout-ce85ab437c5ba129.js` |
| 12 | `6376.d47856f25c395b28.js` |
| 11 | `9816.7a059eb1b340e5a7.js` |
| 10 | `1400.84428caf51bf2a31.js` |
| 8 | `4687.d4b6bd3b7f059952.js` |
| … | 12 more chunks |

## RSC Payload Analysis

### Dashboard (My Work)
- **13KB** across **6** RSC payloads
- Largest: **6KB**

### Kanban Board
- **5KB** across **3** RSC payloads
- Largest: **5KB**

### Calendar
- **0KB** across **2** RSC payloads
- Largest: **0KB**

### Notes
- **6KB** across **5** RSC payloads
- Largest: **6KB**

### Activity
- **6KB** across **4** RSC payloads
- Largest: **6KB**

### Landing (sign-in)
- **6KB** across **1** RSC payloads
- Largest: **6KB**


## Network Waterfall

### Dashboard (My Work) (36 resources)

**Slowest resources:**

| Duration | Size | Type | URL |
|---|---|---|---|
| 847.2ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224?_cb=1783355892509` |
| 683ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224?_cb=1783355892509` |
| 378ms | 6KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/0982ef82-3b79-472d-b` |
| 366.5ms | 0KB | fetch | `https://aspen-os.vercel.app/account?_rsc=7oCetPXLNcwgrIp9` |
| 366.2ms | 5KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/calendar?_rsc=7oCetP` |

### Kanban Board (42 resources)

**Slowest resources:**

| Duration | Size | Type | URL |
|---|---|---|---|
| 2000.2ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/0982ef82-3b79-472d-b` |
| 1009.7ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/0982ef82-3b79-472d-b` |
| 921.5ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/0982ef82-3b79-472d-b` |
| 604.2ms | 6KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/notes?_rsc=n8BRqh_ZK` |
| 557.9ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224?_rsc=n8BRqh_ZKAiP2MH` |

### Calendar (40 resources)

**Slowest resources:**

| Duration | Size | Type | URL |
|---|---|---|---|
| 1112.3ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/calendar?_cb=1783355` |
| 1004.3ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/calendar?_cb=1783355` |
| 383.8ms | 6KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/notes?_rsc=PAcfUuRzX` |
| 383.8ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/calendar?_cb=1783355` |
| 379.5ms | 0KB | fetch | `https://aspen-os.vercel.app/?_rsc=PAcfUuRzXisEde4a` |

### Notes (37 resources)

**Slowest resources:**

| Duration | Size | Type | URL |
|---|---|---|---|
| 908.4ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/notes?_cb=1783355922` |
| 830.5ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/notes?_cb=1783355922` |
| 583.4ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224?_rsc=RYMoKbTiI5YZr2z` |
| 446.9ms | 0KB | fetch | `https://aspen-os.vercel.app/workspaces/new?_rsc=RYMoKbTiI5YZr2zh` |
| 375.5ms | 5KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/calendar?_rsc=RYMoKb` |

### Activity (36 resources)

**Slowest resources:**

| Duration | Size | Type | URL |
|---|---|---|---|
| 913.5ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/activity?_cb=1783355` |
| 904.8ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/activity?_cb=1783355` |
| 422.8ms | 0KB | fetch | `https://aspen-os.vercel.app/?_rsc=u45l-ce-4yf-J-aW` |
| 399.9ms | 5KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/calendar?_rsc=u45l-c` |
| 381.6ms | 6KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/notes?_rsc=u45l-ce-4` |

### Landing (sign-in) (36 resources)

**Slowest resources:**

| Duration | Size | Type | URL |
|---|---|---|---|
| 1461ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224` |
| 1146.9ms | 0KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224` |
| 419.7ms | 5KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/calendar?_rsc=7oCetP` |
| 417.3ms | 0KB | fetch | `https://aspen-os.vercel.app/account?_rsc=7oCetPXLNcwgrIp9` |
| 412.8ms | 6KB | fetch | `https://aspen-os.vercel.app/profile-1783355877224/notes?_rsc=7oCetPXLN` |

## Font Loading

| Route | Font KB | Font Files |
|---|---|---|
| Dashboard (My Work) | 68 | 1 |
| Kanban Board | 68 | 1 |
| Calendar | 68 | 1 |
| Notes | 68 | 1 |
| Activity | 68 | 1 |
| Landing (sign-in) | 68 | 1 |

Geist font is self-hosted via next/font (`_next/static/media/`).

## Images & Icons

| Route | Image KB | Image Files | Icon KB | Icon Files |
|---|---|---|---|---|
| Dashboard (My Work) | 0 | 0 | 0 | 0 |
| Kanban Board | 0 | 0 | 0 | 0 |
| Calendar | 0 | 0 | 0 | 0 |
| Notes | 0 | 0 | 0 | 0 |
| Activity | 0 | 0 | 0 | 0 |
| Landing (sign-in) | 0 | 0 | 0 | 0 |

## Layout Shifts (CLS)

| Route | CLS Score | Shifts |
|---|---|---|
| Dashboard (My Work) | 0 | 1 |
| Kanban Board | 0 | 0 |
| Calendar | 0 | 0 |
| Notes | 0 | 1 |
| Activity | 0 | 1 |
| Landing (sign-in) | 0 | 1 |

**Target**: <0.1 Good | <0.25 Needs Improvement | ≥0.25 Poor

## Render-Blocking Resources

All routes share the same render-blocking pattern:
- One WOFF2 font file (self-hosted Geist via next/font)
- One CSS file (`_next/static/css/...`)

Next.js inlines critical CSS and defers non-critical stylesheets. Font is loaded with `font-display: swap` by default.

## Prefetch Behavior

Observed RSC prefetch requests for multiple routes on each page load:
- `_rsc` query parameters in prefetch URLs
- Multiple prefetch requests per page (dashboard, workspace, account)
- Prefetch payloads are small (~0.4KB each)

---

## Ranked Bottlenecks

### 🔴 #1: Dashboard requires multiple sequential fetch roundtrips before render

**Impact**: CRITICAL

**Evidence**: Slowest resource is a fetch at 847.2ms. Waterfall shows fetch → RSC prefetch → RSC prefetch pattern. Dashboard LCP = 1848ms. JS: 1137KB. DOM Content Loaded at 2480.699999988079ms.

**Flamegraph Location**: DevTools → Network → filter by `fetch`. The dashboard page triggers multiple RSC fetch calls before content renders. Main thread shows these fetches in parallel with JS parsing.

**Estimated Cost**: ~554ms of waterfall delay from sequential fetch dependencies.

**Recommended Fix**: 1) Batch Supabase queries where possible. 2) Use a single RSC fetch instead of multiple client-side fetches. 3) Move data fetching to server components that stream alongside the HTML.

**Estimated Improvement**: LCP reduction of 300-800ms

### 🟠 #2: Excessive JavaScript per route (avg 1177KB, max 1264KB)

**Impact**: HIGH

**Evidence**: All routes load 1137-1264KB JS (uncompressed). A single shared chunk is 410KB. Kanban has the most (1264KB in 29 files). Dashboard FCP = 1728ms, TTFB = 79ms; the gap (TTFB→FCP = 1649ms) is dominated by JS download + parse + React hydration.

**Flamegraph Location**: DevTools → Network → JS tab → sort by size. 2432-267b4018a68077e2.js (410KB) is the largest chunk. Main thread flamegraph shows Evaluate Script entries totaling 200-400ms for this chunk alone. React hydration adds another 200-500ms after JS evaluation.

**Estimated Cost**: JS parse/execute: 400-1200ms on fast desktop; 1500-3000ms on mid-range mobile. Hydration: 200-500ms of additional main thread blocking.

**Recommended Fix**: 1) Audit barrel imports in page/layout files. 2) Replace lucide-react star imports with direct icon imports (saves ~80KB). 3) Lazy-load @dnd-kit (kanban-only, ~50KB), react-markdown (notes-only, ~30KB), cmdk (Cmd+K only, ~15KB) with next/dynamic() and ssr: false. 4) Split the 410KB shared chunk by identifying which large libraries are shared across all routes. 5) Ensure @supabase/ssr and @supabase/supabase-js are tree-shaken.

**Estimated Improvement**: Bundle reduction of 200-400KB (20-35%). FCP improvement of 500-1200ms.

### 🟢 #3: Font loading: 68KB (1 files)

**Impact**: LOW

**Evidence**: Geist font variants total 68KB. One WOFF2 is render-blocking. Font is self-hosted via next/font.

**Flamegraph Location**: DevTools Performance → Network → filter by 'woff2'. Check 'Font' track for swap timing.

**Estimated Cost**: Potential FOIT or FOUT depending on `font-display` strategy.

**Recommended Fix**: Consider subsetting Geist to Latin character set. Use `font-display: optional` for non-critical text. Preload the primary font variant.

**Estimated Improvement**: Saves 40-60KB on first load, eliminates font-related CLS.

## Recommendations Priority

### Immediate (Critical)
- 1) Batch Supabase queries where possible.

### Short-term (High)
- 1) Audit barrel imports in page/layout files.

### Medium-term (Medium)

### Nice-to-have (Low)
- Consider subsetting Geist to Latin character set.

## Metrics Requiring Manual Verification

The following require Chrome DevTools Performance tab + React DevTools Profiler in a real browser:

| Metric | How to Measure |
|---|---|
| React commit time | React DevTools Profiler → record → inspect commit bars |
| Re-render count | React DevTools Profiler → select commit → component list shows renders |
| Largest React trees | React DevTools Components → sort by children count |
| JS parse/execute time | DevTools Performance → Bottom-Up → 'Evaluate Script' |
| Hydration timeline | DevTools Performance → search 'hydrate' in Main thread |
| RSC streaming timeline | DevTools Network → filter `_rsc` → timing tab |
| Component-level bundle attribution | DevTools → Sources → Coverage → replay to see used/unused bytes |

## Profiling Limitations

1. **Headless Chromium** — React DevTools Profiler unavailable; commit/render metrics estimated from proxy data.
2. **No network throttling** — Results from fast local connection. Real-world 3G/4G will be significantly worse.
3. **Single sample per route** — Server load, CDN cache, and random variance affect results. Average 3+ runs for stable data.
4. **No interaction profiling** — Only initial page load. Dialog open, drag-and-drop, search have their own performance profiles.
5. **RSC streaming** — Playwright waits for 'networkidle'. Streaming responses may not be fully reflected in timing data.
6. **CLS measurement** — PerformanceObserver for layout-shift may miss early shifts that occur before observer registration.
7. **Response size via body()** — Reading full response body adds negligible overhead but may alter timing for streamed responses.
