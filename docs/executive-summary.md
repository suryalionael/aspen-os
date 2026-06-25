# Executive Summary — Sprint 1

**Author:** Unified Leadership Team (Founder/PM, CTO, Product Engineer, UX Reviewer)
**Status:** Approved
**Related:** [`prd-sprint-1.md`](prd-sprint-1.md) · [`architecture.md`](architecture.md) · [`database-schema.md`](database-schema.md) · [`technical-plan.md`](technical-plan.md) · [`ux-review.md`](ux-review.md)

## 1. Sprint 1 Final Scope

A new user can sign in, create a workspace, create a project, create tasks, and move tasks across a Kanban board — reaching their first created task in **3 minutes or less**. Built on Next.js + Supabase (Postgres/Auth/RLS) on Vercel, with `workspaces → projects → tasks` as the only data hierarchy.

## 2. Approved Features

- Authentication (email/password sign-up and sign-in)
- Workspaces (create, switch)
- Projects (create, within a workspace)
- Tasks (create via inline quick-add, within a project)
- Kanban View (drag tasks across Backlog / To Do / In Progress / Done)

## 3. Rejected Features

| Feature | Disposition | Reason |
|---|---|---|
| Organization layer (above Workspace) | Rejected for MVP | Not in `CLAUDE.md`'s MVP feature list; adds a setup step that works against the ≤ 3-minute time-to-value target; can be added later as a non-breaking `org_id` column if usage data ever validates the need. See `architecture.md` §2. |
| My Work Dashboard / "My Tasks" view | Deferred to Sprint 2 | Already its own distinct roadmap item in `CLAUDE.md`, separate from Kanban View; not part of this sprint's explicit goal; adds a decision point during onboarding. See `prd-sprint-1.md` §6. |
| Calendar View, Table View, List View | Deferred to future sprints | Sequenced after Sprint 1 per `CLAUDE.md` MVP feature list; not needed to validate the core loop. |
| `task_status` as a separate table | Rejected | Status is a small, fixed set of values — a constrained column is simpler and sufficient. See `database-schema.md`. |
| CRM, AI Assistant, Time Tracking, Payroll, Billing, Complex Automations, Advanced Reporting, Mobile App | Rejected (explicit non-goals) | Per `CLAUDE.md`, until MVP adoption is validated. |

## 4. Risks

- **Forced workspace creation on first sign-in** could feel like friction if the form isn't kept to a single field (mitigated — see `ux-review.md` §8).
- **Drag-and-drop on touch devices** has lower discoverability than desktop; accepted for Sprint 1 under the desktop-first/mobile-friendly principle, to be revisited if pilot feedback raises it.
- **Fixed four-column Kanban vocabulary** may not match every workspace's internal process language; accepted as an intentional MVP opinion, revisited only if validated by real usage, not by speculation.
- **Single Supabase project / no staging environment** is appropriate for pilot scale but should be revisited before any public launch beyond invited pilots.

## 5. Recommendations

- Hold the line on the Workspace-only hierarchy and the "My Tasks" deferral through Sprint 1 — both were evaluated explicitly (not assumed) and both favor shipping the core loop fastest.
- Treat the ≤ 3-minute time-to-value target as a release gate, not just a metric to observe after launch: if internal testing during development exceeds it, fix the flow before pilot release rather than shipping and measuring.
- Recruit a small number of pilot nonprofit/volunteer workspaces for Sprint 1 validation rather than a general launch — the Sprint Success Definition below assumes a pilot cohort, not public availability.

## 6. North Star Metric

**Workspace engagement: the share of created workspaces that have at least one task moved across the Kanban board within 7 days of creation.** This single metric captures the full loop — it requires sign-in, workspace creation, project creation, task creation, and active Kanban use to all have happened, and to have happened recently enough to reflect real adoption rather than one-time setup.

Supporting signals (not the North Star itself, but tracked alongside it): user adoption (signed-in users who complete workspace creation), tasks completed (tasks moved to "Done"), and workspace engagement frequency (active workspaces per week).

## 7. Sprint Success Definition

*"What evidence would demonstrate that Sprint 1 has successfully validated the product?"*

- **Product Validation Criteria:** pilot workspaces complete the full flow (sign in → create workspace → create project → create task → move task) unassisted, with no support intervention required.
- **Adoption Criteria:** ≥ 70% of invited workspace members sign in and create or move at least one task within their first week. **Headline measurable target: median time-to-first-task ≤ 3 minutes** for new users (per `prd-sprint-1.md` AC-6).
- **Usage Criteria:** average tasks created per active workspace per week; average Kanban moves per task (a high ratio signals real day-to-day use rather than one-off testing).
- **Technical Success Criteria:** zero critical bugs or data-loss incidents in the core flow during pilot; RLS policies hold with no cross-workspace data leakage; no perceptible lag on Kanban drag interactions.
- **Measurable examples tracked during pilot:** number of active users, number of workspaces created, number of projects created, number of tasks created, number of Kanban column moves, qualitative pilot feedback (would each pilot workspace choose to keep using Aspen OS after Sprint 1).

## 8. Implementation Roadmap

Sequenced per `technical-plan.md` §6, each step shippable and demoable on its own:

1. Auth (sign-up/sign-in)
2. Workspace creation
3. Project creation
4. Task CRUD (quick-add)
5. Kanban drag-and-drop
6. Polish — loading/empty/error states, responsive pass (per `CLAUDE.md` Definition of Done)
7. Pilot release to a small set of invited nonprofit/volunteer workspaces
8. Measure against the Sprint Success Definition (§7) before scoping Sprint 2 (My Work Dashboard, Calendar/Table/List views)

## 9. Go / No-Go Recommendation

**Go.** Scope is deliberately minimal, every deferred feature has a documented evaluation rather than an assumption, the data model avoids unvalidated complexity, and the time-to-value target gives the team a concrete, testable bar to clear before pilot release. Proceed to implementation in the order above.
