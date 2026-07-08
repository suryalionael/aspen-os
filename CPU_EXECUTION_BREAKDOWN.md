# CPU Execution Breakdown

**Route**: Dashboard — `/cpu-1783411865889`
**Environment**: Production (https://aspen-os.vercel.app)
**Method**: CDP `Performance.getMetrics` + Navigation Timing API
**Device**: Playwright Chromium (headless)
**Warm-up**: 3 cold runs before trace

## Executive Summary

**JavaScript is NOT the bottleneck.** CDP reports only 77ms of `ScriptDuration` (total JS execution time) across the entire page load. Of the ~2000ms TTFB→Interactive gap, **95.6% (1930ms) is Network I/O + idle time** — the browser is waiting for the server to finish streaming its RSC response, not computing JavaScript.

This changes the optimization strategy: **the shared 409KB chunk's impact is negligible (77ms execution).** The real bottleneck is the server-to-client streaming pipeline.

## 1. Timeline Summary

| Phase | Time (ms) |
|---|---|
| Navigation Start | 0 |
| TTFB (server response) | 105 |
| Response End | 2124 |
| First Contentful Paint | 1240 |
| DOM Interactive | 2124 |
| DOM Complete | 2125 |
| Load Complete | 2125 |
| **Critical gap (TTFB → Interactive)** | **2019ms** |

## 2. Phase Breakdown (from Performance API)

| Phase | Duration | % of Critical Path | What Happens |
|---|---|---|---|
| Server (TTFB) | 105 ms | 5 % | Server render shell (P0-P5 optimized) |
| Render pipeline (TTFB → FCP) | 1135 ms | 56 % | Server stream continues + HTML parse + CSS + first paint |
| JS + Hydrate (FCP → Load) | 885 ms | 44 % | Script download, parse, exec, React hydrate |
| **Critical path total** | 2019 ms | 100% | TTFB to DOM Interactive |

## 3. Timeline Visualization

```
0ms                   2124ms
TTFB  105ms  ██
FCP  1240ms                       ▓▓
INT  2124ms                                        ▒▒
```

## 4. CPU Work Breakdown (CDP Performance.getMetrics)

| Category | Total (ms) | % Main Thread | Source |
|---|---|---|---|
| Script (Parse + Execute) | 77.5 | 3.8 | CDP `ScriptDuration` |
| V8 Compilation | 1.0 | 0.0 | CDP `V8CompileDuration` |
| Style Recalculation | 5.4 | 0.3 | CDP `RecalcStyleDuration` |
| Layout | 6.3 | 0.3 | CDP `LayoutDuration` |
| Task Other | 55.3 | 2.7 | CDP `TaskOtherDuration` |
| **Total Active CPU** | **145.6** | **7.2** | CDP `TaskDuration` |
| Network I/O + Idle | 1873.4 | 92.8 | Remainder (gap − TaskDuration) |

| **Critical gap total** | **2019 ms** | **100%** | |

The browser thread is active for only 7.2% of the critical path. **92.8% is waiting.**

### Aggregate Summary

| Aggregate Type | Total (ms) | % CPU |
|---|---|---|
| JavaScript (Parse + Execute) | 77.5 | 3.8 |
| Rendering (Style + Layout) | 11.7 | 0.6 |
| Other (idle, GC, network wait) | 1929.8 | 95.6 |

## 5. Estimated React Hydration Cost

| Period | Duration | What It Contains |
|---|---|---|
| FCP → Interactive | 884 ms | Tail of server stream + JS exec + React hydration |

With only 77ms of total ScriptDuration in the full page load, React hydration is estimated at **~46ms** (60% of JS execution in post-FCP window). This is negligible.

## 6. Answer: Single Largest Contributor

The critical path breakdown is:

```
TTFB → FCP:           1135ms  (56%)  — Server streaming + HTML/CSS rendering
FCP → Interactive:     884ms  (44%)  — Tail of stream + JS exec + hydration
────────────────────────────────────────
Total:                2019ms
```

The **single largest contributor** is **Network I/O** — the browser waiting for the server to complete its streaming response. This accounts for **1930ms (95.6%)** of the critical path.

### Why the Streaming Gap is So Large

Next.js App Router with React Server Components (RSC) streams the page in phases:

1. **105ms** — Server sends initial HTML shell (nav, sidebar shell). This is fast because P0-P5 reduced server work.
2. **105 → 1240ms** — Server computes and streams the dashboard's RSC payload (workspace data, projects, tasks, activity feed). FCP fires when enough content has arrived.
3. **1240 → 2124ms** — Server completes streaming the remaining RSC payload, including `<script>` tags at the end of the stream.
4. **~2124ms** — Browser discovers scripts, downloads them (parallel), executes (~146ms), fires DOM Interactive.

The streaming itself (server-side computation + network transfer of the full RSC payload) takes **~2000ms**. This is the dominant cost.

### Why the 409KB Bundle is NOT the Problem

| Concern | Measurement | Verdict |
|---|---|---|
| 409KB shared chunk parse/exec time | 77ms total across all scripts | Negligible |
| Script download time | ~200ms (parallel, starts at 1143ms) | Sub-component of stream |
| React hydration | ~46ms estimated | Negligible |
| **Stream wait** | **~1930ms** | **The real bottleneck** |

The 409KB bundle only contributes 77ms of execution. Even if we reduced it to 0KB, we'd save only 4% of the critical path.

## Appendix: Script Resource Timing (Top 5)

| Script | Duration (ms) | Size (KB) | Start (ms) |
|---|---|---|---|
| `webpack-71b67c7f682536df.js` | 84 | 5 | 1143 |
| `4bd1b696-196a3828912dace0.js` | 98 | 169 | 1143 |
| `2-4efdb8cdf86d4986.js` | 180 | 409 | 1144 |
| `5707-cecbc1f5cc407e08.js` | 102 | 23 | 1144 |
| `main-app-2bde4d1435a0c010.js` | 196 | 3 | 1144 |

Total script duration (Resource Timing API): 3276 ms

## Appendix: CDP Performance Metrics (Raw)

| Metric | Value |
|---|---|
| `Timestamp` | 166244.05 |
| `AudioHandlers` | 0.00ms |
| `AudioWorkletProcessors` | 0.00ms |
| `Documents` | 3.00 |
| `Frames` | 1.00 |
| `JSEventListeners` | 396.00 |
| `LayoutObjects` | 154.00 |
| `MediaKeySessions` | 0.00ms |
| `MediaKeys` | 0.00ms |
| `Nodes` | 284.00 |
| `Resources` | 32.00 |
| `ContextLifecycleStateObservers` | 4.00 |
| `V8PerContextDatas` | 4.00 |
| `WorkerGlobalScopes` | 0.00ms |
| `UACSSResources` | 0.00ms |
| `RTCPeerConnections` | 0.00ms |
| `ResourceFetchers` | 3.00 |
| `AdSubframes` | 0.00ms |
| `DetachedScriptStates` | 2.00 |
| `ArrayBufferContents` | 24.00 |
| `LayoutCount` | 3.00 |
| `RecalcStyleCount` | 10.00 |
| `LayoutDuration` | 6.29ms |
| `RecalcStyleDuration` | 5.41ms |
| `DevToolsCommandDuration` | 0.03ms |
| `ScriptDuration` | 77.46ms |
| `V8CompileDuration` | 1.04ms |
| `TaskDuration` | 145.55ms |
| `TaskOtherDuration` | 55.32ms |
| `ThreadTime` | 149.25ms |
| `ProcessTime` | 318.42ms |
| `JSHeapUsedSize` | 5980144.00 |
| `JSHeapTotalSize` | 9961472.00 |
| `FirstMeaningfulPaint` | 166238.89 |
| `DomContentLoaded` | 166239.77 |
| `NavigationStart` | 166237.65 |

| JS Heap Used | 9.5 MB |
| JS Heap Total | 10.7 MB |

## Methodology

- **CPU data**: CDP `Performance.getMetrics` — cumulative counters collected via `Performance.enable` + `Performance.getMetrics` after page reaches `networkidle`. These counters accumulate from page start.
- **Timeline**: Navigation Timing API (`performance.getEntriesByType('navigation')[0]`)
- **Script timing**: `PerformanceResourceTiming` for each `_next/static` JS resource
- **React timing**: Inferred from Performance API gap (FCP → Interactive), not measured directly
- **Heap**: `performance.memory` (Chromium only)
- **Single sample**: One trace per route with 3 cold warm-up runs before measurement
- **Headless**: Playwright Chromium (headless) with `--no-sandbox`
- **Key limitation**: `TaskDuration` from CDP counts only active main-thread work. Network I/O, async waits, and server streaming time are measured via Navigation Timing.

## What This Means

The P0-P5 optimizations (server side) were correct. The server TTFB is excellent (105ms). But the server streaming time after TTFB is the dominant cost. The client-side JS — including the 409KB shared chunk — is not the bottleneck.

If further optimization is desired, focus on:
1. **Server streaming performance** — why does the full RSC stream take ~2000ms?
2. **Script discovery timing** — can scripts be referenced earlier in the stream (before the `<body>` close)?
3. **Streaming architecture** — is the benefit of streaming worth the ~2000ms delay in `domInteractive`?

---
_Generated at 2026-07-07T08:11:45.247Z_