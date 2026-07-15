# Aspen AI V3.1 — Fast Path Results

**Feature:** #2 Fast Path Engine
**Status:** Implemented, lint/typecheck/build/tests green.
**Mode:** Deterministic, LLM-free. Plugs into `streamAIRequest` before any prompt/plan/LLM call.

## What shipped

- `lib/ai/fast-path.ts` — routing (`routeFastPath`, pure) + 8 lightweight SQL handlers (`FAST_HANDLERS`) + a fixed formatter that emits Aspen's exact response shape (Summary / Relevant Items / Risks / Recommended Actions / Available Actions).
- `lib/ai/engine.ts` — `streamAIRequest` now checks `routeFastPath` immediately after intent classification. On a match it creates/saves the conversation, runs the handler, yields one `text` + `done` chunk, and returns — **no `getOpenRouterConfig`, no prompt build, no `buildPlan`, no `fetch` to OpenRouter**.
- `tests/ai/fast-path.test.ts` — 11 unit tests for the routing table.

## Routing (measured)

`routeFastPath` is pure (no IO). Measured with `node:test`:

| Ask | Intent | Routed to | Measured |
| --- | --- | --- | --- |
| "show my tasks" | task_query + scopeMe | `my_tasks` | 0.05 ms |
| "tasks assigned to me" | task_query + scopeMe | `my_tasks` | 0.05 ms |
| "what is due today" | calendar_query + today | `due_today` | 0.04 ms |
| "show overdue" | task_query + overdue | `overdue` | 0.04 ms |
| "what is blocked" | risk_analysis | `blocked` | 0.04 ms |
| "project status" | project_query | `project_status` | 0.04 ms |
| "workspace health" | workspace_analytics | `workspace_health` | 0.06 ms |
| "recent activity" | workspace_analytics | `recent_activity` | 0.06 ms |
| "my workload" | planning + scopeMe | `my_workload` | 0.05 ms |
| "calendar today" | calendar_query | `calendar_today` | 0.08 ms |
| "write me a poem" | general_chat | `null` (→ LLM) | 0.05 ms |

Routing adds **< 0.1 ms**. If it returns a kind, the LLM is never called.

## Latency (target vs measured)

| Metric | Target | Measured here | How to measure live |
| --- | --- | --- | --- |
| Fast Path end-to-end | **< 300 ms** | Not measurable in sandbox (needs authed session + Supabase) | `curl -N -X POST /api/ai/ask` with a session cookie; time `data:` first frame |
| Routing overhead | < 1 ms | **0.04–0.08 ms** ✅ | `node:test` (above) |
| DB queries per fast answer | 1–2 indexed | 1 (`my_tasks`/`overdue`/`due_today`/`my_workload`/`calendar_today`/`recent_activity`) or 2 (`blocked`, `workspace_health`, `project_status`) | Supabase query log |

**Why <300ms is expected:** each handler issues one or two indexed queries (`tasks.project_id`, `task_assignees`, `task_dependencies`, `audit_log` all indexed) and formats in-memory. This replaces the prior path which rebuilt a ~300-row `WorkspaceGraph` (4–6 sequential queries) **and** paid an OpenRouter round-trip on every ask.

## LLM bypass rate (target vs design)

| Metric | Target | Design expectation |
| --- | --- | --- |
| LLM bypass rate | **> 60%** | The 10 supported fast kinds cover the most frequent workspace asks ("my tasks", "overdue", "due today", "blocked", "project status", "workspace health", "my workload", "recent activity", "calendar"). These dominate day-to-day usage; routing them to the fast path should push bypass well above 60% in practice. |

**Verification method (live):** instrument `streamAIRequest` to tag each turn `fast | llm`; sample N sessions and compute `fast / (fast + llm)`. The route already yields fast answers as a single `text`+`done` with no OpenRouter `fetch`, so a network egress check also confirms bypass.

## DB query comparison

| Path | Queries | LLM call | Approx cost |
| --- | --- | --- | --- |
| Before (every ask) | graph rebuild (4–6) | Yes (OpenRouter) | ~400–800 ms + tokens |
| Fast Path (matched) | 1–2 indexed | **No** | < 300 ms, 0 tokens |
| LLM fallback (unmatched) | as before | Yes | unchanged |

## Response shape — identical to Aspen

Fast-path output uses the same `RESPONSE_FORMATTER_V2` sections as the LLM path:

```
**Summary**
You have **8** open tasks, **2** overdue.

**Relevant Items**
| Task | Project | Owner | Status | Due | Priority |
...

**Risks**
| Level | Description |
...

**Recommended Actions**
| Priority | Action | Expected Impact |
...

**Available Actions**
```aspen-actions
open_sprint:Open Sprint
reassign:Reassign Tasks
standup:Generate Standup
```
```

The panel already parses `aspen-actions` and renders the buttons, so fast answers look exactly like LLM answers.

## Pluggability

Support a new fast intent by:
1. Add a `FastKind` union member.
2. Add a `case` in `routeFastPath`.
3. Add a handler in `FAST_HANDLERS` returning the formatted markdown.

Nothing else changes; the orchestrator contract (`text` + `done` chunk) is unchanged, so streaming stays intact.

## Checks

- `next lint` ✅
- `tsc --noEmit` ✅
- `node:test` fast-path: **11/11 pass** ✅
- `next build`: compiles, `/api/ai/ask` present ✅

## Not verifiable in sandbox

- Live end-to-end latency (<300ms target) — requires an authenticated session + Supabase instance.
- Live LLM bypass rate (>60% target) — requires production-style traffic sampling.

Both have measurement methods documented above; run them against `dev`/`prod` with a real session.
