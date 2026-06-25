# Database Schema — Sprint 1

**Author:** CTO
**Status:** Approved for build
**Related:** [`architecture.md`](architecture.md) · [`technical-plan.md`](technical-plan.md)

## 1. Tables

Four tables for Sprint 1: `workspaces`, `workspace_members`, `projects`, `tasks`. No `organizations` table (see `architecture.md` §2) and no `task_status` table (status is a column, not an entity).

### `workspaces`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `name` | `text` | not null |
| `slug` | `text` | not null, unique |
| `created_by` | `uuid` | FK → `auth.users.id`, not null |
| `created_at` | `timestamptz` | not null, default `now()` |
| `updated_at` | `timestamptz` | not null, default `now()` |

### `workspace_members`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `workspace_id` | `uuid` | FK → `workspaces.id`, not null, on delete cascade |
| `user_id` | `uuid` | FK → `auth.users.id`, not null |
| `role` | `text` | not null, default `'member'`, check in (`'owner'`, `'member'`) |
| `created_at` | `timestamptz` | not null, default `now()` |
| | | unique (`workspace_id`, `user_id`) |

### `projects`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `workspace_id` | `uuid` | FK → `workspaces.id`, not null, on delete cascade |
| `name` | `text` | not null |
| `created_by` | `uuid` | FK → `auth.users.id`, not null |
| `created_at` | `timestamptz` | not null, default `now()` |
| `updated_at` | `timestamptz` | not null, default `now()` |

### `tasks`

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `project_id` | `uuid` | FK → `projects.id`, not null, on delete cascade |
| `title` | `text` | not null |
| `status` | `text` | not null, default `'todo'`, check in (`'backlog'`, `'todo'`, `'in_progress'`, `'done'`) |
| `position` | `numeric` | not null — fractional ordering within a column (avoids re-indexing siblings on reorder) |
| `assignee_id` | `uuid` | FK → `auth.users.id`, nullable — column exists for future use; no assignee UI ships in Sprint 1 |
| `created_by` | `uuid` | FK → `auth.users.id`, not null |
| `created_at` | `timestamptz` | not null, default `now()` |
| `updated_at` | `timestamptz` | not null, default `now()` |

`status` is intentionally a constrained `text` column, not a separate table — the four values are fixed and not user-configurable in Sprint 1.

## 2. Required Indexes

| Table | Index | Purpose |
|---|---|---|
| `workspace_members` | `(workspace_id)` | RLS membership lookups, member listing |
| `workspace_members` | `(user_id)` | "which workspaces is this user in" lookups, RLS |
| `projects` | `(workspace_id)` | listing projects per workspace |
| `tasks` | `(project_id)` | listing tasks per project |
| `tasks` | `(project_id, status, position)` (composite) | Kanban board query: fetch and order tasks per column in one indexed scan |
| `tasks` | `(assignee_id)` | future-proofing for assignee-filtered queries (e.g. Sprint 2 "My Tasks") |

## 3. Relationship Diagram

```
auth.users (Supabase managed)
    │
    │ (N:N via workspace_members)
    ▼
workspaces ──(1:N)──► projects ──(1:N)──► tasks
    │                                       │
    └──────────── workspace_members         └── assignee_id → auth.users (nullable, FK)
```

This matches the relationships described in `architecture.md` §3 — Workspace → Project → Task as a strict 1:N chain, with workspace membership as the only many-to-many relationship in Sprint 1.
