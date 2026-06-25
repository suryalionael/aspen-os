# Architecture — Sprint 1

**Author:** CTO
**Status:** Approved for build
**Related:** [`prd-sprint-1.md`](prd-sprint-1.md) · [`database-schema.md`](database-schema.md) · [`technical-plan.md`](technical-plan.md)

## 1. System Architecture

Aspen OS Sprint 1 is built on a minimal, managed-services stack — no custom backend service of any kind.

```
┌─────────────────────────────┐
│   Next.js (App Router)      │  Server Components + Server Actions
│   TypeScript / Tailwind /   │  for all data mutations
│   shadcn/ui                 │
└──────────────┬───────────────┘
               │ Supabase JS client (server + browser)
               ▼
┌─────────────────────────────┐
│   Supabase                  │
│   - Postgres                │
│   - Auth                    │
│   - Row Level Security      │
└─────────────────────────────┘
               │
               ▼
        Hosted on Vercel
```

- **Frontend & "backend":** Next.js App Router. Reads happen in Server Components; writes happen via Server Actions calling Supabase directly. There is no separate REST/GraphQL API layer to build or maintain.
- **Database & Auth:** Supabase Postgres with built-in Auth (email/password for Sprint 1) and Row Level Security as the sole authorization mechanism.
- **Hosting:** Vercel for the Next.js app; Supabase is already hosted/managed.

This keeps Sprint 1 to two moving parts (Next.js app, Supabase project), matching the CTO mandate to prioritize simplicity, maintainability, rapid development, and low cost.

## 2. Strategic Evaluation: Organization layer vs. Workspace-only

A prior planning pass proposed an `Organization → Workspaces → Projects → Tasks` hierarchy. Before locking the schema, this was re-evaluated against MVP goals.

| | **Option A: Workspace-only** (no Org layer) | **Option B: Organization → Workspaces** |
|---|---|---|
| **Pros** | Matches `CLAUDE.md`'s actual MVP feature list (only "Workspaces" is listed — "Organizations" is not); one fewer concept for first-time nonprofit admins to learn; fewer tables and RLS policies; faster to ship | Models real-world nonprofits that might run multiple workspaces under one legal entity; avoids a future migration if multi-workspace orgs are ever needed |
| **Cons** | If a nonprofit later needs multiple workspaces under one umbrella, adding org-scoping later requires a migration | Extra hierarchy level, extra route segment, extra RLS join, and an extra onboarding step — all before any user has validated they need it |
| **Complexity Impact** | Low — one less table; RLS membership is checked directly on `workspace_members` | Medium — every query and policy gains an org-scoping hop |
| **Future Scalability** | Workspaces can gain an optional `org_id` later as a non-breaking addition once multi-org need is actually validated | Already future-proofed, but speculatively, against a need that hasn't been observed |
| **UX Impact** | One fewer setup screen before first value (sign in → workspace, not sign in → org → workspace) — directly supports the ≤ 3-minute time-to-value target | Extra screen/step before a first-time user reaches their first project |

**Recommendation: Option A — Workspace-only for Sprint 1.**

**Rationale:** `CLAUDE.md`'s MVP feature list and this role's own engineering principles ("avoid overengineering," "challenge premature abstractions," "default recommendation: choose the simplest solution that works") both argue against adding an unvalidated hierarchy level. The Organization concept is not in the approved MVP feature list, and it would directly work against the Sprint 1 time-to-value target of 3 minutes by adding a mandatory setup step. **The Organization layer is rejected for Sprint 1.** It can be introduced later as a non-breaking addition (`workspaces.org_id`, nullable) if and when usage data shows nonprofits need it.

## 3. Table Relationships

```
Workspace (1) ──── (N) Project (1) ──── (N) Task
    │
    └──── (N) WorkspaceMember (N) ──── (1) User (auth.users)
```

- A **Workspace** has many **Projects**.
- A **Project** has many **Tasks**.
- A **Workspace** has many **Users** through **WorkspaceMember** (many-to-many), which also carries the user's role within that workspace.
- **Tasks** reference an optional `assignee_id` (a workspace member) — laid in now since it's a single column, but no assignee-facing UI (e.g. "My Tasks") ships this sprint; see `prd-sprint-1.md` §6.

Full column-level schema: [`database-schema.md`](database-schema.md).

## 4. Row Level Security Strategy

RLS is the only authorization layer — there is no application-level permission system to build or maintain.

- **Principle:** a user can read or write a row only if they are a member of the workspace that row belongs to (directly, or transitively through `project_id` → `workspace_id`).
- **`workspaces`:** `SELECT`/`UPDATE` allowed if the requesting user has a row in `workspace_members` for that workspace. `INSERT` allowed for any authenticated user (creating a workspace auto-inserts them as a member in the same transaction/RPC).
- **`workspace_members`:** `SELECT` allowed for members of the same workspace; `INSERT` restricted to the creation flow (self-membership on workspace creation) — no separate invite flow in Sprint 1.
- **`projects`:** all operations gated on `EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = projects.workspace_id AND user_id = auth.uid())`.
- **`tasks`:** all operations gated the same way, joined through `projects.workspace_id`.

This single membership-check pattern, repeated per table, is intentionally simple — no recursive policies, no separate roles/permissions table for Sprint 1.

## 5. Supabase Implementation Plan

1. **Auth:** enable email/password auth (Supabase Auth default). No magic links, SSO, or OAuth providers in Sprint 1 — keeps the sign-in flow to one screen.
2. **Schema migration:** apply table definitions from `database-schema.md` in dependency order (`workspaces` → `workspace_members` → `projects` → `tasks`).
3. **RLS:** enable RLS on all four tables; apply policies as the last migration step, after tables and indexes exist.
4. **No Edge Functions, no triggers beyond `updated_at` timestamps.** Workspace-creation-with-self-membership is handled as a single Postgres function (`create_workspace_with_owner`) called via RPC from the Server Action, so it's transactional without needing a serverless function.
5. **Environment:** one Supabase project for Sprint 1 (no separate staging project required yet, given pilot scale).

## 6. Explicit Rejections

- **Microservices** — unnecessary at this scale; a single Next.js app is sufficient.
- **Separate backend service / custom API layer** — Supabase + Server Actions cover all Sprint 1 needs.
- **Event-driven architecture** — no async processing requirement exists yet.
- **Premature abstractions** (e.g. generic "entity" or "permissions" framework) — four concrete tables are enough.
- **A `task_status` table** — status is a fixed, small set of values; a Postgres enum/text column with a check constraint is simpler and sufficient (see `database-schema.md`).
- **An Organization layer above Workspace** — rejected for Sprint 1 per the evaluation in §2.
