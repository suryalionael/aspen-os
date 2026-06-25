# Aspen OS Roadmap

## Current Phase: MVP

Aspen OS is in MVP development. The MVP must prove that nonprofit and community organizations will adopt a simple, opinionated project OS in place of spreadsheets, email threads, and fragmented tools. See `CLAUDE.md` for the full mission, vision, and non-goals.

## Sprint 1 (Active)

**Goal:** A new user can sign in, create a workspace, create a project, create tasks, and move tasks on a Kanban board — and reach their first created task in under 3 minutes.

Scope: Authentication, Workspaces, Projects, Tasks, Kanban View.

Full detail: [`docs/prd-sprint-1.md`](docs/prd-sprint-1.md), [`docs/architecture.md`](docs/architecture.md), [`docs/database-schema.md`](docs/database-schema.md), [`docs/technical-plan.md`](docs/technical-plan.md), [`docs/ux-review.md`](docs/ux-review.md), [`docs/executive-summary.md`](docs/executive-summary.md).

## Future Sprints (Not Yet Scoped)

Deferred until Sprint 1 is validated with real users — order is indicative, not committed:

- **My Work Dashboard** — cross-project "My Tasks" view (deferred out of Sprint 1; see PRD Out-of-Scope section for rationale)
- **Calendar View**
- **Table View**
- **List View**
- **Multi-workspace Organization layer** — only if usage data shows nonprofits genuinely need multiple workspaces grouped under one entity (see `docs/architecture.md` Strategic Evaluation — rejected for Sprint 1 as premature)

## Explicit Non-Goals (all phases, until MVP adoption is validated)

CRM, AI Assistant, Time Tracking, Payroll, Billing, Complex Automations, Advanced Reporting, Mobile App. See `CLAUDE.md`.
