# Aspen OS — Decision Log

**Purpose:** This document is institutional memory. It captures the major product, architecture, UX, and implementation decisions made during Sprint 1 planning, so future contributors and AI agents don't have to re-derive *why* the system is shaped the way it is, or accidentally re-open a question that was already deliberately settled.

**How to use this log:** Before proposing a structural change (a new table, a new layer, a new interaction model), check here first. If a decision exists, either honor it or explicitly revisit it using the "Future Revisit Conditions" listed — don't silently contradict it.

**Source documents:** [`prd-sprint-1.md`](prd-sprint-1.md) · [`architecture.md`](architecture.md) · [`database-schema.md`](database-schema.md) · [`technical-plan.md`](technical-plan.md) · [`ux-review.md`](ux-review.md) · [`executive-summary.md`](executive-summary.md) · [`pre-implementation-audit.md`](pre-implementation-audit.md) · [`implementation-roadmap.md`](implementation-roadmap.md) · [`build-order.md`](build-order.md) · [`sprint-1-execution-plan.md`](sprint-1-execution-plan.md)

Every entry below documents a decision that was already made and approved somewhere in the above documents — this log introduces no new decisions.

---

## Product & Scope Decisions

### DEC-001 — Workspace-first architecture
**Decision:** `Workspace` is the top-level container for Sprint 1. There is no entity above it — the data model is `Workspace → Projects → Tasks`.
**Rationale:** Matches `CLAUDE.md`'s actual MVP feature list, which names "Workspaces" but never "Organizations"; keeps the onboarding path to the minimum number of concepts a first-time nonprofit admin must learn.
**Alternatives Considered:** `Organization → Workspaces → Projects → Tasks` (Option B in `architecture.md` §2) — modeled real-world nonprofits that might run multiple workspaces under one legal entity.
**Tradeoffs:** Accepted a future migration cost (adding org-scoping later) in exchange for one fewer onboarding step now and a simpler RLS model today.
**Owner:** CTO
**Date:** 2026-06-25 (Sprint 1 planning)
**Future Revisit Conditions:** Revisit only if real usage data from validated nonprofit pilots shows a genuine need for one entity to manage multiple workspaces — not speculatively.

### DEC-002 — Rejection of the Organization layer
**Decision:** An `organizations` table and any org-scoping above `workspaces` is explicitly out of scope for Sprint 1.
**Rationale:** `architecture.md` §2's CTO evaluation found the Organization layer added a mandatory setup step that directly worked against the ≤3-minute time-to-value target (DEC-005), for a need that had not been validated by any user.
**Alternatives Considered:** Same as DEC-001 (these are two sides of one decision, logged separately for traceability since both were independently flagged as required topics).
**Tradeoffs:** If multiple-workspace organizations turn out to be common among pilot nonprofits, this will require a later (non-breaking) migration: `workspaces.org_id`, nullable.
**Owner:** CTO
**Date:** 2026-06-25
**Future Revisit Conditions:** Same as DEC-001 — only on validated usage evidence, never preemptively.

### DEC-003 — Rejection of a `task_status` table
**Decision:** Task status is a constrained `text` column with a check constraint (`backlog` / `todo` / `in_progress` / `done`) on the `tasks` table — not a separate table.
**Rationale:** The set of statuses is small, fixed, and not user-configurable in Sprint 1; a separate table would be an unnecessary join and an unnecessary abstraction for a value set that doesn't change.
**Alternatives Considered:** A `task_status` lookup/reference table, allowing user-defined or per-workspace statuses.
**Tradeoffs:** Expanding or customizing statuses later requires a schema migration *and* a UI rebuild of the fixed-column Kanban board (acknowledged and accepted in `ux-review.md` §8 and `executive-summary.md` §4).
**Owner:** CTO
**Date:** 2026-06-25
**Future Revisit Conditions:** Revisit if/when validated user feedback shows a real need for custom or per-workspace status columns — not before.

### DEC-004 — "My Tasks" / My Work Dashboard deferred to Sprint 2
**Decision:** No cross-project "My Tasks" view ships in Sprint 1. `tasks.assignee_id` exists in the schema but has no UI in Sprint 1 (see DEC-013).
**Rationale:** `CLAUDE.md` already lists "My Work Dashboard" as its own distinct MVP feature, separate from Kanban View — building it in Sprint 1 means shipping two roadmap items in one sprint instead of validating one. It was also never part of the user's explicit Sprint 1 goal (sign in → workspace → project → tasks → Kanban).
**Alternatives Considered:** Building a minimal assignee-filtered view in Sprint 1, given its high daily-use value and low marginal build cost once `assignee_id` exists.
**Tradeoffs:** Sprint 1 users working across multiple concurrent projects have no single place to see everything assigned to them until Sprint 2.
**Owner:** Founder/PM, UX Reviewer (joint evaluation, per `prd-sprint-1.md` §6 and `ux-review.md` §7)
**Date:** 2026-06-25
**Future Revisit Conditions:** Build it once Sprint 1's core single-project loop is validated with real pilot usage, and once a workspace's typical user is observed running multiple concurrent projects.

### DEC-005 — ≤3-minute Time-to-Value requirement
**Decision:** A brand-new user must be able to go from sign-in to a created first task in 3 minutes or less, with no guidance. This is a hard design constraint and a release gate (`prd-sprint-1.md` AC-6), not just a metric observed after the fact.
**Rationale:** Directly mandated as a non-negotiable requirement; it shapes every onboarding/creation flow decision (single-field forms, no forced intermediate steps, no organization layer, no email-confirmation interstitial).
**Alternatives Considered:** None — this was supplied as a fixed requirement, not a tradeoff to weigh.
**Tradeoffs:** Every other Sprint 1 decision (DEC-002, DEC-011, DEC-014, DEC-015) was evaluated partly against whether it helps or hurts this target — it has been the single biggest constraint shaping Sprint 1's scope.
**Owner:** Unified Leadership Team (binding constraint applied across all phases)
**Date:** 2026-06-25
**Future Revisit Conditions:** Treat as a release gate per `executive-summary.md` §5 — if internal/pilot testing (per `sprint-1-execution-plan.md` Phase 9) exceeds 3 minutes, fix the flow before production release rather than relaxing the target.

---

## Architecture & Data Model Decisions

### DEC-006 — No dedicated event table in Sprint 1
**Decision:** Sprint Success Metrics (`prd-sprint-1.md` §7) are computed from existing `created_at`/`updated_at` columns already present on `workspaces`, `projects`, and `tasks` (plus Supabase-managed `auth.users.created_at`) — no new `events` table is created.
**Rationale:** `implementation-roadmap.md` T52 had left "an events table or existing timestamp columns" as an open implementation choice; `sprint-1-execution-plan.md` Phase 8 resolved it in favor of existing columns specifically because Sprint 1 has no task-edit feature, so `tasks.updated_at` is a safe, unambiguous proxy for "task moved" — adding a new table for this purpose would have been schema growth with no other use.
**Alternatives Considered:** A dedicated `events` table logging every user action with a timestamp, more flexible for future analytics needs.
**Tradeoffs:** This approach silently breaks the moment a task-edit feature ships (any edit would also bump `updated_at`, making it a poor "moved" proxy at that point) — flagged explicitly in `sprint-1-execution-plan.md` Phase 8 so a future developer doesn't misread stale metrics logic.
**Owner:** Product Engineer
**Date:** 2026-06-25
**Future Revisit Conditions:** Revisit the moment any task-edit feature is scoped — at that point, either add a dedicated `events` table or a separate `status_changed_at` column, since `updated_at` will no longer cleanly mean "moved."

### DEC-007 — Supabase + Vercel managed-services architecture
**Decision:** The entire Sprint 1 backend is Supabase (Postgres + Auth + Row Level Security); the entire frontend/hosting is Next.js on Vercel. No custom backend service, no separate API layer.
**Rationale:** `architecture.md` §1 — keeps Sprint 1 to two moving parts, matching the CTO mandate to prioritize simplicity, maintainability, rapid development, and low cost.
**Alternatives Considered:** A separate backend service (e.g. a custom REST/GraphQL API), microservices, or an event-driven architecture — all explicitly rejected in `architecture.md` §6 as unnecessary at this scale.
**Tradeoffs:** Couples the application tightly to Supabase's feature set (Auth, RLS, Postgres) — acceptable given the "prefer managed services" engineering principle and Sprint 1's pilot scale.
**Owner:** CTO
**Date:** 2026-06-25
**Future Revisit Conditions:** Revisit only if Supabase's managed offering becomes a genuine scaling or cost bottleneck after MVP adoption is validated — not preemptively.

### DEC-008 — Server Components + Server Actions, no custom API layer
**Decision:** All reads happen in Next.js Server Components; all writes happen via Server Actions calling Supabase directly. No REST/GraphQL endpoints are built, and no client-side data-fetching library (React Query, etc.) or global client store is used.
**Rationale:** `architecture.md` §1 and `technical-plan.md` §5 — sufficient for Sprint 1's scale; client state is scoped only to the Kanban board's optimistic drag-and-drop interaction.
**Alternatives Considered:** A traditional client-fetched API layer with a global state-management library.
**Tradeoffs:** Keeps the codebase simple and the dependency list small, at the cost of less flexibility if complex client-side interactivity needs grow significantly beyond the Kanban board.
**Owner:** CTO, Product Engineer
**Date:** 2026-06-25
**Future Revisit Conditions:** Revisit if a future feature genuinely requires client-side state shared across many components — not for the current scope.

### DEC-009 — Row Level Security as the sole authorization layer
**Decision:** There is no application-level permissions system. All authorization is enforced via Postgres RLS policies, gated on workspace membership (`workspace_members`).
**Rationale:** `architecture.md` §4 — "RLS is the only authorization layer — there is no application-level permission system to build or maintain," consistent with avoiding premature abstraction.
**Alternatives Considered:** A separate roles/permissions table and application-layer authorization checks.
**Tradeoffs:** Simple and centralized, but means every new table added later must repeat the same membership-check policy pattern by hand — there's no shared permissions abstraction to lean on yet.
**Owner:** CTO
**Date:** 2026-06-25
**Future Revisit Conditions:** Revisit if/when role-based permissions (owner vs. member) become load-bearing — see DEC-012, which already anticipates this.

### DEC-010 — `SECURITY DEFINER` RPC for atomic workspace creation
**Decision:** Workspace creation (workspace row + the creator's membership row) happens atomically inside a single Postgres function, `create_workspace_with_owner`, running as `SECURITY DEFINER`. There is **no** client-facing INSERT policy on `workspace_members` at all.
**Rationale:** `architecture.md` §5 named the function; `pre-implementation-audit.md` findings S-1 and T-2 identified that without an explicit `SECURITY DEFINER` requirement and an explicit denial of direct client INSERT access, any signed-in user could self-insert membership into any workspace, bypassing RLS intent entirely. `sprint-1-execution-plan.md` Phase 2 made both requirements explicit and testable.
**Alternatives Considered:** Two separate client-side inserts (workspace, then membership) gated by ordinary RLS INSERT policies.
**Tradeoffs:** Slightly more setup (one Postgres function, with care taken on its security context) in exchange for closing a critical cross-workspace data-exposure risk.
**Owner:** CTO
**Date:** 2026-06-25
**Future Revisit Conditions:** Re-verify (via `scripts/test-rls.ts`, per DEC-009) any time a new write path to `workspace_members` is considered, e.g. a future invite feature (see DEC-011).

### DEC-011 — No invite flow / single-member workspaces in Sprint 1
**Decision:** There is no mechanism for a second person to join an existing workspace in Sprint 1. `workspace_members` INSERT is restricted to the workspace-creation flow only.
**Rationale:** `architecture.md` §4 scoped this deliberately to keep Sprint 1 minimal — explicitly stated as "no separate invite flow in Sprint 1."
**Alternatives Considered:** A minimal invite-by-email mechanism, which `pre-implementation-audit.md` finding C-2 flagged as in tension with the PRD's "shared... for the whole team" framing.
**Tradeoffs:** As scoped, a workspace can only ever have one member — the audit explicitly flagged this as a contradiction with the product's stated team-collaboration value proposition. This was surfaced for leadership awareness but the underlying architecture decision (no invite flow) was not reversed in any subsequent document.
**Owner:** CTO (decision); Founder/PM (owns the flagged messaging contradiction, per audit C-2)
**Date:** 2026-06-25
**Future Revisit Conditions:** Must be resolved — either descope the "whole team" framing from the PRD, or add a minimal invite mechanism as explicitly evaluated new scope — before any pilot messaging claims multi-person collaboration.

### DEC-012 — `workspace_members.role` retained but inert in Sprint 1
**Decision:** The `role` column (`'owner'` / `'member'`) exists on `workspace_members`, but no RLS policy or UI in Sprint 1 differentiates behavior by role.
**Rationale:** `pre-implementation-audit.md` finding C-3 flagged this as the same kind of premature structure that DEC-002 rejected for the Organization layer. `sprint-1-execution-plan.md` Phase 2 resolved the inconsistency not by dropping the column, but by explicitly documenting it as inert via a migration comment, rather than leaving it silently unused.
**Alternatives Considered:** Dropping `role` entirely for Sprint 1 and re-adding it only when ownership-gated actions are actually built.
**Tradeoffs:** Carries a column with no current behavioral effect, in exchange for not needing a migration when owner-only actions (e.g. "only the owner can delete a workspace") are eventually built.
**Owner:** CTO
**Date:** 2026-06-25
**Future Revisit Conditions:** Revisit the first time any feature needs to distinguish owner from member — at that point, add the corresponding RLS policy and UI together, not separately.

### DEC-013 — `tasks.assignee_id` retained but unused in Sprint 1
**Decision:** The `assignee_id` column (and its index) exists on `tasks`, but no Sprint 1 UI sets or displays it.
**Rationale:** Anticipates the Sprint 2 "My Tasks" feature (DEC-004). `pre-implementation-audit.md` finding U-1 flagged this as the same speculative-build pattern rejected elsewhere; `sprint-1-execution-plan.md` Phase 2 resolved it the same way as DEC-012 — keep it, but document the exception explicitly via a migration comment rather than leaving it unexplained.
**Alternatives Considered:** Dropping the column from Sprint 1's migrations and adding it (plus its index) only when "My Tasks" is actually built.
**Tradeoffs:** A small amount of inert schema today, in exchange for no migration needed when Sprint 2 begins.
**Owner:** CTO
**Date:** 2026-06-25
**Future Revisit Conditions:** Becomes load-bearing the moment Sprint 2's "My Tasks" view is built — no further schema change needed at that point, only UI.

### DEC-020 — Single Supabase project, no staging environment for Sprint 1
**Decision:** Sprint 1 runs on one Supabase project, with no separate staging/pre-production environment.
**Rationale:** `architecture.md` §5 — "no separate staging project required yet, given pilot scale."
**Alternatives Considered:** A separate staging Supabase project mirroring production for safer migration testing.
**Tradeoffs:** Faster and cheaper for Sprint 1's small pilot, but `executive-summary.md` §4 already flags this as something that "should be revisited before any public launch beyond invited pilots."
**Owner:** CTO
**Date:** 2026-06-25
**Future Revisit Conditions:** Add a staging environment before any launch beyond the initial invited pilot cohort.

---

## Security & Auth Decisions

### DEC-014 — Email confirmation disabled for Sprint 1
**Decision:** Supabase Auth's default "confirm email before sign-in" requirement is explicitly turned off for Sprint 1.
**Rationale:** `pre-implementation-audit.md` finding C-1 identified that leaving Supabase's default enabled would make the ≤3-minute Time-to-Value requirement (DEC-005) unmeetable for any new sign-up, since it forces the user to leave the app, open an email client, and click a link. `sprint-1-execution-plan.md` Phase 3 (task T17) made the explicit choice to disable it rather than relax DEC-005.
**Alternatives Considered:** Leaving Supabase's default confirmation flow enabled and revising AC-6 to exclude email-confirmation time from the measured 3 minutes.
**Tradeoffs:** Slightly weaker initial account-verification posture (unconfirmed emails can create workspaces) in exchange for a measurable, achievable time-to-value target during a small, invited pilot.
**Owner:** CTO, Product Engineer
**Date:** 2026-06-25
**Future Revisit Conditions:** Revisit before any public (non-invited) sign-up is allowed — re-enable confirmation or add an equivalent anti-abuse mechanism at that point.

---

## UX & Interaction Decisions

### DEC-015 — Inline quick-add for task creation (no modal)
**Decision:** New tasks are created via an inline input pinned to a Kanban column, not a modal dialog.
**Rationale:** `ux-review.md` §5 — a modal interrupts the board view and adds a close/cancel decision point; inline quick-add keeps the user's eyes on the board and supports rapid sequential entry, important for a volunteer coordinator entering a backlog in one sitting.
**Alternatives Considered:** A `Dialog`-based task creation form (more room for future optional fields).
**Tradeoffs:** Faster entry now, but less room to add optional fields (e.g. description, due date) without redesigning the interaction if those are ever added.
**Owner:** UX Reviewer
**Date:** 2026-06-25
**Future Revisit Conditions:** Revisit if/when tasks need more than a title at creation time — a modal becomes more justifiable once there's more than one field to fill in.

### DEC-016 — Drag-and-drop plus keyboard fallback as the task status-change mechanism
**Decision:** Dragging a card between Kanban columns is the primary way to change task status; a keyboard-focusable "Move to…" control on each card is the accessible fallback. There is no status dropdown/select as a third option.
**Rationale:** `architecture.md` §6 and `ux-review.md` §6 originally rejected a status dropdown "to keep the interaction model to one mental model." `pre-implementation-audit.md` finding X-1 then identified that drag-and-drop alone leaves keyboard/screen-reader users with no way to move a task at all; `implementation-roadmap.md` T44 and `sprint-1-execution-plan.md` Phase 6 resolved this by adding the keyboard fallback rather than abandoning the single-mental-model design.
**Alternatives Considered:** A status dropdown on every card (rejected for adding a second mental model); accepting drag-only as a documented Sprint 1 limitation (rejected once flagged as a complete accessibility blocker, not just reduced affordance).
**Tradeoffs:** One extra small control per card, in exchange for the interaction being achievable by every input modality.
**Owner:** UX Reviewer, Product Engineer
**Date:** 2026-06-25
**Future Revisit Conditions:** None anticipated — this resolves the accessibility gap directly; revisit only if user testing reveals the "Move to…" control itself is confusing.

### DEC-017 — Fixed four-column Kanban board (not configurable)
**Decision:** Every project's Kanban board has exactly four columns — Backlog, To Do, In Progress, Done — matching the `tasks.status` check constraint. Columns are not user-configurable in Sprint 1.
**Rationale:** Consistent with "opinionated over configurable" (`CLAUDE.md` Product Principles) and DEC-003's rejection of a separate status table.
**Alternatives Considered:** User- or workspace-configurable column names/counts.
**Tradeoffs:** `pre-implementation-audit.md` and `executive-summary.md` both flag that the fixed vocabulary may not match every workspace's internal process language — accepted as an intentional MVP opinion.
**Owner:** Founder/PM, UX Reviewer, CTO
**Date:** 2026-06-25
**Future Revisit Conditions:** Revisit only if validated by real pilot usage showing the fixed vocabulary is a genuine adoption blocker — not by speculation.

---

## Implementation Decisions

### DEC-018 — Slug generation with collision-retry strategy
**Decision:** Workspace slugs are generated by slugifying the workspace name; on a uniqueness collision, a short numeric/random suffix is appended and generation retries.
**Rationale:** `database-schema.md` requires `workspaces.slug` to be unique, but no document originally specified how collisions (e.g. two pilot nonprofits both named "Volunteers") would be handled. `pre-implementation-audit.md` finding M-4 flagged this gap; `implementation-roadmap.md` T23 and `sprint-1-execution-plan.md` Phase 4 resolved it with this explicit strategy.
**Alternatives Considered:** Requiring globally unique workspace names (worse UX, defeats the purpose of allowing any name); failing loudly on collision and asking the user to pick a different name (adds a step inside the timed onboarding flow, working against DEC-005).
**Tradeoffs:** A small amount of slug-generation complexity in exchange for a collision never blocking the timed onboarding flow.
**Owner:** Product Engineer
**Date:** 2026-06-25
**Future Revisit Conditions:** None anticipated for Sprint 1 scale; revisit only if slug-based routing needs change (e.g. custom vanity URLs).

### DEC-019 — Fractional `position` ordering with a rebalance safeguard
**Decision:** Task ordering within a Kanban column uses a fractional `numeric` `position` column (avoiding re-indexing every sibling on reorder), with a defined rebalance routine that re-spaces a column's positions once adjacent values converge below a threshold.
**Rationale:** `database-schema.md` chose fractional positioning for reordering efficiency; `pre-implementation-audit.md` finding M-5 flagged the well-known failure mode of fractional-indexing schemes (numeric precision decay after many reorders) with no defined mitigation. `implementation-roadmap.md` T43 and `sprint-1-execution-plan.md` Phase 6 added the explicit rebalance safeguard.
**Alternatives Considered:** Integer positions with full re-indexing of siblings on every reorder (simpler logic, more writes per move); no rebalancing at all (simpler, but eventually breaks under heavy use).
**Tradeoffs:** Slightly more implementation complexity (a rebalance routine and its trigger threshold) in exchange for avoiding a hard-to-reproduce ordering bug after sustained real usage.
**Owner:** Product Engineer
**Date:** 2026-06-25
**Future Revisit Conditions:** None anticipated; revisit only if a different ordering scheme (e.g. linked-list-style ordering) is ever needed for a feature beyond Sprint 1's scope.

---

## Sprint 2 Decisions

### DEC-021 — Dedicated `task_activity` table resolves DEC-006
**Decision:** Sprint 2 introduces a dedicated `task_activity` table (migration 010) rather than continuing to rely on `tasks.updated_at` as a proxy for "task moved."
**Rationale:** DEC-006 explicitly flagged this exact moment as its own revisit trigger: "the moment any task-edit feature is scoped... add a dedicated `events` table or a separate `status_changed_at` column." Sprint 2 ships both task editing (Phase A) and an explicit Activity Log feature, so a shared event table resolves both needs at once rather than building two narrower mechanisms.
**Alternatives Considered:** A single `status_changed_at` column (narrower — would not generalize to comments, label changes, or checklist activity, which Phase A also needs to log).
**Tradeoffs:** One new table and one new RLS helper (`is_workspace_member_for_task`) versus continuing to overload timestamp columns. `event_type` is left as unconstrained text (not a check constraint like `tasks.status` per DEC-003) since the set of event types will keep growing across Sprint 2 phases — a check constraint would mean a migration per phase.
**Owner:** Product Engineer
**Date:** 2026-06-26 (Sprint 2)
**Future Revisit Conditions:** None anticipated; this table is designed to be reused by every subsequent Sprint 2 feature that needs an audit trail (comments, labels, checklist items).

---

### DEC-022 — Invite-link workspace joining resolves DEC-011, makes role load-bearing (resolves DEC-012)
**Decision:** Sprint 2 adds a single-use-per-workspace, shareable invite-link mechanism (`workspace_invites` table + `join_workspace_via_invite` RPC) rather than email-based invites. `workspace_members.role` becomes load-bearing for the first time: only an `'owner'` may create/revoke invites or remove other members; any member (including an owner) may remove themselves ("leave workspace").
**Rationale:** DEC-011 explicitly required either dropping the "shared with the whole team" framing or adding a real invite mechanism before any pilot messaging claims multi-person collaboration — Sprint 2 chooses the latter. DEC-012 anticipated this exact moment: "the first time any feature needs to distinguish owner from member... add the corresponding RLS policy and UI together." A link (not email) avoids requiring a transactional-email provider, which doesn't exist in this stack yet.
**Alternatives Considered:** Email-based invites (rejected for this sprint — would add a new external service dependency with no existing provider configured); allowing any member to invite/remove (rejected — undermines the point of having an owner role at all).
**Tradeoffs:** An invite link has no expiry and is reusable until revoked, which is weaker than a single-use emailed link; acceptable given pilot scale and that an owner can revoke it. If the inviter (not yet authenticated) follows the link before signing up, they must manually return to the same link after sign-up/sign-in — no redirect-after-auth mechanism exists yet, and building one was treated as separate scope.
**Owner:** CTO, Product Engineer
**Date:** 2026-06-27 (Sprint 2)
**Future Revisit Conditions:** Add invite expiry/single-use semantics and a redirect-after-auth flow if pilot feedback shows the current link behavior is confusing or a security concern at larger scale.

---

### DEC-023 — Realtime extends client state beyond drag-and-drop; notifications are ephemeral, not persisted
**Decision:** Phase E adds Supabase Realtime (`postgres_changes`) subscriptions on `tasks` (scoped per project) and `comments` (scoped per task), so changes from other sessions appear without a manual reload. Notifications are transient, session-local toasts triggered by those same subscriptions — not a persisted notification log or center.
**Rationale:** DEC-008 scoped client-side state to "only the Kanban board's optimistic drag-and-drop interaction"; receiving remote changes live is a genuinely new category of client state, not a variation of the existing one, so it's recorded here rather than silently expanding DEC-008's stated scope. A persisted notification system would duplicate `task_activity` (DEC-021) and overlap with Phase F's dashboard "recent activity" — building both would be redundant scope, not two complementary features.
**Alternatives Considered:** Polling instead of Realtime (simpler, but defeats the actual point of "live" updates); a persisted, markable-read notifications table (rejected for this sprint as redundant with task_activity).
**Tradeoffs:** A board open in two tabs/sessions now needs to merge two sources of truth (local optimistic state and remote events) by task ID rather than only ever trusting its own writes — done by always treating the latest known row state as authoritative, so a remote echo of one's own action is a harmless no-op rather than a conflict. Toasts disappear on their own and aren't recoverable if missed, which is an accepted limitation, not an oversight.
**Owner:** Product Engineer
**Date:** 2026-06-27 (Sprint 2)
**Future Revisit Conditions:** Build a persisted notification center only if pilot feedback shows missed ephemeral toasts are a real problem — not preemptively.

---

### DEC-024 — Profile preferences (bio/theme/timezone/notifications) live in auth.users.user_metadata, not a profiles table
**Decision:** Phase G's bio, theme, timezone, and "show in-app notifications" preference are stored via `supabase.auth.updateUser({ data: {...} })`, landing in `auth.users.raw_user_meta_data`, rather than a new `profiles` table. Only the avatar — a binary file — needs real Storage (`avatars` bucket, migration 021, one object per user at `<user_id>/avatar.<ext>`, RLS-scoped to the owning user for write, public for read since avatars render as plain `<img>` tags with no per-request signed URL).
**Rationale:** None of these four fields are ever queried across users or joined against in this sprint — each is read only by its own owner, on their own account page or to drive their own client-side behavior (theme class, notification gating). That is exactly the shape `user_metadata` is for, and avoids a table + RLS policies + migration for data with no cross-user access pattern. Avatars differ: they're binary and rendered to other users (e.g. a future members facepile), so they need Storage and a public-read policy regardless.
**Alternatives Considered:** A dedicated `profiles` table keyed by `user_id` (rejected for this sprint — no current feature reads another user's bio/theme/timezone/notification setting; adding the table preemptively would be exactly the kind of unvalidated structure CLAUDE.md's "avoid overengineering" rule warns against). Revisit if a future feature needs to show one member's bio/timezone to another (e.g. a profile card in the Members dialog) — at that point a `profiles` table becomes justified by an actual cross-user read.
**Tradeoffs:** `user_metadata` isn't indexed or queryable via PostgREST filters, which is fine since nothing filters on it; it's also visible to any code holding the user's session (not a secrecy boundary), which is acceptable since none of these four fields are sensitive.
**Owner:** Product Engineer
**Date:** 2026-06-27 (Sprint 2)
**Future Revisit Conditions:** Move bio/theme/timezone/notifications into a real `profiles` table the moment any feature needs to read one user's profile data from another user's session (e.g. showing teammates' bios or timezones in the Members dialog).

---

### DEC-025 — Task attachments use a private Storage bucket with signed URLs, not the avatars bucket's public-read model
**Decision:** Phase H's file attachments (migration 022: `task_attachments` table + `task-attachments` bucket) are private. Every read goes through a server-generated signed URL (1 hour TTL via `createSignedUrl`), gated by the same `is_workspace_member_for_task(uuid)` helper (migration 010) already used for comments/checklist/labels — both on the table's RLS and on `storage.objects` via `(storage.foldername(name))[1]::uuid`.
**Rationale:** DEC-024 made the avatars bucket public specifically because avatars are meant to be shown to anyone; task content is the opposite — it's private to the task's own workspace, matching every other piece of task data in this schema. A public bucket would mean anyone with a guessed/leaked URL could read a task's files forever, with no membership check and no revocation path.
**Alternatives Considered:** Public bucket with obscure (UUID-based) paths (rejected — "security by obscurity," no real access control, and a removed workspace member would keep working access forever); RLS-only with no signed URLs (not possible — `storage.objects` RLS governs API access, not direct object URLs, so a private bucket requires signed URLs to be readable from the browser at all).
**Tradeoffs:** Signed URLs expire (1 hour here), so a link copied out of the app and reopened later will 403 — acceptable, since the app always re-fetches a fresh signed URL on open rather than caching the old one indefinitely.
**Owner:** Product Engineer
**Date:** 2026-06-27 (Sprint 2)
**Future Revisit Conditions:** None anticipated.

---

### DEC-026 — Three-tier roles (owner/admin/member) extend, not replace, DEC-022's invite model
**Decision:** Sprint 3 Phase I adds an `'admin'` role between owner and member (migration 023). Permissions: owner = everything; admin = manage projects (create/rename/archive/delete) and invite/revoke members, same as before but no longer owner-exclusive; member = full task-level work (tasks, comments, checklist, labels, attachments — unchanged) but cannot manage projects, invites, member roles, or workspace deletion. Member removal, role changes, and ownership transfer stay owner-only, funneled through two new `SECURITY DEFINER` RPCs (`change_member_role`, `transfer_workspace_ownership`) rather than a generic `UPDATE` policy on `workspace_members`, so a workspace can never end up with zero or more than one owner. Invites gained `invited_email` (metadata only — see DEC-027), `accepted_at`, and `declined_at` so a single "Pending invitations" list can show real status instead of just active/revoked.
**Rationale:** The Sprint 3 brief requires three roles with admin able to "manage projects, manage tasks, invite members" — DEC-022's owner-only model couldn't express that distinction. Funneling role/ownership changes through RPCs (rather than RLS-only) keeps the single-owner invariant enforceable in one place instead of relying on every future caller to maintain it correctly.
**Alternatives Considered:** A generic `UPDATE` policy on `workspace_members` allowing the owner to set any role value (rejected — nothing would stop a buggy or malicious caller from creating a second `'owner'` row, or removing the only owner, since RLS `USING`/`WITH CHECK` clauses can't easily enforce "exactly one owner" as a cross-row invariant).
**Tradeoffs:** Project management UI (the "New project" button, archived-projects list, and per-project settings dialog) is now hidden client-side for plain members per their role — this is a UX nicety on top of the real enforcement, which is RLS; a member who somehow triggers the action anyway gets a clear server error, not a silent failure.
**Owner:** CTO, Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** None anticipated.

### DEC-027 — Invite-by-email remains metadata only; no transactional email provider added
**Decision:** Phase I's "invite by email" stores the invitee's email on the invite row for tracking/display in the "Pending invitations" list, but does not send an actual email — the inviter still shares the link manually, exactly as DEC-022 already established for link-based invites.
**Rationale:** Sending real email requires a transactional email provider (e.g. Resend, Supabase SMTP) with an API key/account that doesn't exist in this stack. Explicitly confirmed with the product owner rather than assumed (2026-06-28): keep this manual for now rather than take on a new external service dependency mid-sprint.
**Alternatives Considered:** Wiring up a real provider (rejected for this sprint — requires the user to first create an account and provision credentials before any deploy could work; revisit if/when that's done).
**Tradeoffs:** An invite "sent" to an email today is really just a labeled link; nothing stops the inviter from sharing it with someone else instead, and nothing verifies the eventual joiner's account email matches `invited_email`. Acceptable since this mirrors the pre-existing link model's trust assumptions.
**Owner:** Founder/PM
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** Add a real transactional email provider once the user provisions one; at that point, also consider whether `join_workspace_via_invite` should verify the joining account's email matches `invited_email` when one is set.

---

### DEC-028 — Full-text search stays client-side substring matching; no Postgres tsvector
**Decision:** Phase J's "full text search" extends the existing client-side title search (DEC from Phase B) to also match each task's `description`, still via a plain case-insensitive substring check over the already-loaded board state — no `tsvector`/`to_tsquery` index, no server round-trip per keystroke.
**Rationale:** CLAUDE.md's "simplicity over flexibility" and "avoid overengineering" directly apply: a Kanban board's realistic task count per project (tens to a few hundred) makes a database full-text index pure overhead with no perceptible benefit over filtering an array already sitting in memory. The "Calendar picker" requirement in the same phase is likewise already satisfied by the native `<input type="date">` already in use since Phase A2 — no custom calendar widget was built for the same reason.
**Alternatives Considered:** Postgres `tsvector` + `to_tsquery` (rejected — disproportionate for this scale, and would require fetching `description` server-side per keystroke instead of filtering client-side data already in memory).
**Tradeoffs:** Search only covers what's already loaded on the board (title, description) — it does not search comments, checklist items, or attachment names. Revisit if pilot feedback specifically asks for that.
**Owner:** Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** Add a real Postgres full-text index only if/when task volume per project grows large enough that client-side filtering becomes a real performance problem — not preemptively.

---

### DEC-029 — Persisted notification center (revisits and supersedes DEC-023's deferral)
**Decision:** Phase K adds a real, persisted, recipient-scoped `notifications` table (migration 024) with a bell/badge/mark-read UI — exactly what DEC-023 (Sprint 2) deferred, reasoning it would duplicate `task_activity`. This explicit Sprint 3 request supersedes that deferral.
**Rationale:** The two are genuinely distinct once actually built: `task_activity` is an append-only, task-scoped audit trail visible to every workspace member; `notifications` is recipient-scoped, carries read/unread state, and exists specifically to be acted on by one person. Triggers: assignment (editTask), comments (addComment — both the assignee/creator and any @mentioned member), and checklist completion (toggleChecklistItem, only on the toggle that completes the last item). "Due today" has no time-based trigger available (no cron infra exists in this stack — see Phase P), so it's generated lazily by the bell itself on load via `checkDueTodayNotifications`, scanning the caller's own assigned tasks due today.
**Alternatives Considered:** A real cron/scheduled function for due-today (rejected for this phase — no scheduling infra exists yet; revisit if Phase P adds one). Mention autocomplete UI (rejected — DEC-030 covers the simpler approach taken instead).
**Tradeoffs:** Due-today notifications only appear once a logged-in member with that workspace open loads the bell that day — there's no proactive push if nobody opens the app. A partial unique index on `(user_id, task_id) where type = 'due_today'` means a task is only ever notified-due-today once per task, not once per calendar day it remains due (deliberate — avoids spam, see the migration 025 entry below).
**Owner:** Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** Add a real scheduled job for due-today (and possibly overdue-reminder) notifications once Phase P establishes scheduling/cron infrastructure.

### DEC-030 — @mentions detect exact member emails typed in comments; no autocomplete picker
**Decision:** The "mentioned" notification trigger scans new comment text for any workspace member's exact email address and notifies that member — there's no `@`-triggered autocomplete UI for inserting a mention.
**Rationale:** A real mention-picker (type `@`, see a filtered dropdown, insert a styled chip) is a substantial UI feature on its own; plain email detection delivers the actual user value (the mentioned person gets notified) at a fraction of the cost, consistent with "avoid overengineering."
**Alternatives Considered:** A full autocomplete mention picker (rejected for this phase — disproportionate scope for an MVP; revisit if pilot feedback specifically asks for it).
**Tradeoffs:** Users must know and type a teammate's exact email to mention them — no name-based or partial matching.
**Owner:** Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** Build a real autocomplete picker if pilot feedback shows the exact-email requirement is a real friction point.

---

### DEC-031 — Calendar view shares KanbanBoard's client state; no separate fetch or route
**Decision:** Phase L's Calendar view is a render-mode toggle inside the existing `KanbanBoard` component, sharing the same `tasksByStatus` state (flattened) rather than a separate page, route, or data fetch. Dragging a task chip onto a different day calls a new single-field `updateTaskDueDate` action (mirrors why `moveTask` is separate from the full `editTask` form).
**Rationale:** The board already owns the authoritative, Realtime-synced task list for the project; duplicating that fetch for a second view would mean two sources of truth to keep in sync. A toggle (not a route) matches the literal spec ("Toggle between them") and avoids the cost of a new page/loading state for data that's already in memory.
**Alternatives Considered:** A separate `/[workspaceSlug]/[projectId]/calendar` route with its own fetch (rejected — duplicates state, and the Realtime subscription would need to run twice or be lifted to a shared parent, more complexity for no real benefit at this scale).
**Tradeoffs:** Calendar view ignores the Kanban toolbar's search/filter/sort (shows every non-archived task) — these are board-specific concerns, not "what's due when."
**Owner:** Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** None anticipated.

---

### DEC-032 — Workspace settings (logo/description/timezone/danger zone/export) follow established patterns exactly
**Decision:** Phase M adds `description`, `logo_url`, `default_timezone`, and `archived_at` to `workspaces` (migration 026). Logo upload reuses the avatars bucket's public-read pattern (DEC-024); general field edits (name/description/logo/timezone) move from "any member" to admin+owner, matching DEC-026's project-management framing; archive/restore/delete stay owner-only via dedicated RPCs (`archive_workspace`/`unarchive_workspace`), the same pattern as `change_member_role`/`transfer_workspace_ownership`. Export (JSON/CSV) gathers the workspace's projects and tasks server-side and streams them to the browser as a downloaded file — no new API route, just a Server Action returning a string that the client wraps in a Blob.
**Rationale:** Resolves the open item from `pre-implementation-audit.md` finding M-1 ("no edit/delete for workspaces, projects, or tasks") — projects and tasks already gained this in Sprint 2; workspaces were the last gap. Reusing the avatars/project-archive/RPC patterns exactly (rather than inventing new ones) keeps the codebase's authorization model uniform across every entity type.
**Alternatives Considered:** A `profiles`-style separate settings table (rejected — these are just columns on the workspace itself, no different access pattern from `name`/`slug`).
**Tradeoffs:** Deleting a workspace cascades through every project/task/comment/etc. beneath it via existing FKs — there is no recovery once confirmed, same as the existing per-account delete (DEC from Sprint 1's account deletion feature).
**Owner:** Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** None anticipated.

---

### DEC-033 — Missing GRANT DELETE on workspaces (same class of bug as DEC's earlier missing-grant incident)
**Decision/Finding:** Migration 026 added the first-ever DELETE policy on `public.workspaces` but omitted the table-level `grant delete ... to authenticated` — confirmed directly via a failing E2E test surfacing "permission denied for table workspaces" even though the RLS policy itself was correct. Fixed in migration 027.
**Rationale:** RLS policies only take effect once the underlying `GRANT` permits the operation at all; this table never had a DELETE grant because nothing could delete a workspace before this phase. Recorded here (not just fixed silently) because it's the same root-cause class as the missing grant on `is_workspace_member_for_task` (migration 010/014) — worth naming the pattern explicitly: **whenever a migration adds the first policy for a new command (INSERT/UPDATE/DELETE) on an existing table, also check whether `authenticated` already has that command's table-level grant — it usually doesn't, since `create table` only grants what existing policies needed at the time.**
**Owner:** Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** None — this is a process note for future migrations, not a feature with a revisit trigger.

---

### DEC-034 — A second, workspace-scoped audit_log table sits alongside task_activity (not instead of it)
**Decision:** Phase N's "complete audit log" is a new `audit_log` table (migration 028) — workspace-scoped, target-agnostic (a denormalized `target_label` instead of a foreign key to the thing it describes). Every mutation site that matters for the audit log (task CRUD/move/comment/checklist/attachment, invitations, role changes, project rename/archive/delete, workspace rename/archive) writes to audit_log *in addition to* its existing task_activity/logActivity call where one exists — task_activity (DEC-021) still backs the per-task panel directly.
**Rationale:** task_activity structurally can't be the complete audit log for two reasons: its FK cascades away with the task it describes (by design, per DEC-021 — a per-task history, not a tenant-wide record), so a "task deleted" entry would itself vanish the instant it's written; and it only ever covered task-level events, never project renames, workspace renames, invitations, or role changes. A denormalized `target_label` (not a second set of foreign keys to projects/tasks/users) is what lets an entry survive its subject being deleted or renamed later.
**Alternatives Considered:** Removing task_activity's cascade and repurposing it as the workspace-wide log (rejected — would break the per-task panel's task-scoped queries and contradicts DEC-021's stated reasoning); a generic polymorphic `target_type`/`target_id` pair instead of a label (rejected — adds query complexity for filtering, the label is self-sufficient for an audit log's actual purpose of being read by a human).
**Tradeoffs:** Two real, named exceptions are documented at their call sites rather than silently handled: `declineInvite` writes no audit entry (the decliner never becomes a member, and audit_log's INSERT policy requires membership — same posture as task_activity); `deleteWorkspace` writes no "workspace.deleted" entry (audit_log.workspace_id cascades with the workspace, so the row would be destroyed in the same transaction it's written in — there's no way to audit the deletion of the thing the log itself lives in).
**Owner:** Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** None anticipated.

### DEC-035 — Sidebar header overflow recurrence: a structural lesson, not a one-off fix
**Finding:** Adding a third button ("Audit log") to the sidebar's top header row reproduced the exact "Sidebar layout overflow → click interception" bug from earlier in this engagement — confirmed directly via `boundingBox()`: the "Members" button's right edge landed at ~290px against the sidebar's fixed 224px (`w-56`) width, and Playwright's click failed with a real element (the dashboard's empty-state placeholder) intercepting the pointer event. Fixed by splitting the header into two rows (heading+bell on one, Audit log+Members on the next), the same fix shape as the original incident.
**Rationale:** This is the *second* time a new sidebar button has caused this exact failure mode. Recording it as its own entry (not folding it into DEC-034) to make the pattern explicit for next time: **the sidebar's top header row has no slack left — any new button added there needs its own row, not a spot in the existing one.** Treat this as a standing constraint when adding sidebar actions, not something to re-discover via a failing test each time.
**Owner:** Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** Revisit if the sidebar is ever redesigned with more horizontal room (e.g. a wider layout or a collapsible action menu) — until then, new sidebar-header actions get their own row.

---

### DEC-036 — Phase O performance pass: virtualize non-DnD lists only; defer Kanban-column virtualization
**Decision:** `@tanstack/react-virtual` (user-approved new dependency) is applied to the Archived Tasks dialog and the Audit Log (which also gained real keyset pagination + infinite scroll, replacing its flat 200-row cap). The Kanban board's own task cards are **not** virtualized — `TaskCard` is wrapped in `React.memo` instead, with `onMove`/`onOpen` changed to take `id` and dispatch through a stable parent-owned callback (so the parent can pass one reference to every card instead of a fresh closure each render, which is required for memo's shallow comparison to skip anything).
**Rationale:** dnd-kit's `SortableContext` and `@tanstack/react-virtual` are a documented-compatible combination in principle, but retrofitting it onto the board's already-thoroughly-debugged drag-and-drop (multiple confirmed root-caused bugs earlier this sprint alone) for a scale concern — hundreds of tasks in one column — that's unlikely for this MVP's actual nonprofit/community-org users is a bad risk/reward trade. The Archived Tasks dialog and Audit Log have no such entanglement and are exactly the kind of "can grow long over time" lists virtualization is for.
**Alternatives Considered:** Virtualizing the Kanban column unconditionally (rejected — risk to core interaction disproportionate to benefit at this app's scale); a "Load more" button for the audit log instead of true infinite scroll (rejected — the spec explicitly asked for infinite scrolling, and an IntersectionObserver sentinel is barely more code than a button).
**Tradeoffs:** If a single Kanban column ever does grow into the hundreds of tasks, scrolling that column stays unvirtualized (all cards mounted). Revisit if that actually happens.
**Owner:** Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** Revisit Kanban-column virtualization if real usage shows columns regularly exceeding ~100 tasks.

### DEC-037 — robots.txt/sitemap.xml excluded from auth middleware; home page's Lighthouse SEO score is a known streaming artifact, not a bug
**Finding:** Lighthouse's SEO audit failed "robots.txt is valid" — confirmed directly: `/robots.txt` had no real route (404) and, worse, the auth middleware redirected the unauthenticated request to `/sign-in` (it wasn't in `PUBLIC_PATHS`). Fixed with real `app/robots.ts`/`app/sitemap.ts` routes and excluding both paths from the middleware matcher entirely (the right fix — these must never go through auth logic, regardless of any path allowlist). The home page (`/`) still scores SEO 91 (vs. 100 on `/sign-in`/`/sign-up`) because Lighthouse's static-markup check doesn't see `<meta name="description">` inside `<head>` in the initial response — Next.js App Router streams an async Server Component's `<head>` content in via a deferred script once its data resolves (here, the signed-in-user redirect check), so the tag is present but not in its "expected" position in the raw HTML.
**Rationale:** This streaming behavior is intentional, documented Next.js App Router behavior for any async Server Component page, not an application defect — real crawlers that execute JavaScript (Googlebot included) see the tag correctly. Making `/` synchronous to dodge this specific audit would mean moving its signed-in-user redirect into middleware (a real, legitimate refactor) purely to satisfy a synthetic score on the one page whose entire job is to redirect away — disproportionate risk (touching the foundational middleware that gates every route) for a page that isn't the meaningful public surface anyway (`/sign-in`/`/sign-up` already score SEO 100).
**Owner:** Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** Revisit only if real search-engine indexing (not Lighthouse) shows the home page's description genuinely missing — verify via Google Search Console, not Lighthouse, before spending effort here.

---

### DEC-038 — Sentry and rate limiting deferred again; everything else in Phase P shipped
**Decision:** Phase P's CI (GitHub Actions: type-check/lint/build → DB tests + E2E → deploy-on-main), security review, and backup/disaster-recovery documentation are complete — see `docs/CI-AND-DEPLOYMENT.md`. Sentry (error monitoring) and rate limiting are explicitly **not** implemented this sprint; confirmed with the product owner (2026-06-28) rather than assumed, same as DEC-027's email-provider deferral.
**Rationale:** Both require creating a third-party account (Sentry, Upstash or similar) this assistant cannot do on the user's behalf. `docs/CI-AND-DEPLOYMENT.md`'s "Operational follow-ups" section documents the exact steps to wire each in once accounts exist, so this isn't lost knowledge — just gated on credentials only the user can provision.
**Alternatives Considered:** Building a no-account-needed substitute (e.g. an in-memory rate limiter, console.error-based "monitoring") — rejected as a real fix being passed off as one; an in-memory limiter doesn't survive serverless cold starts or work across multiple instances, and console logging isn't monitoring (no alerting, no aggregation, no historical search). Better to clearly mark this undone than to ship something that looks done but isn't.
**Tradeoffs:** No alerting exists today if production throws unhandled errors — they're only visible by actively checking `vercel logs`/the dashboard. No protection exists against a single account hammering a Server Action (e.g. invite or comment creation) beyond Supabase Auth's own built-in limits on auth-specific endpoints.
**Owner:** Founder/PM, Product Engineer
**Date:** 2026-06-28 (Sprint 3)
**Future Revisit Conditions:** Implement both the moment Sentry/Upstash (or equivalent) accounts exist — see `docs/CI-AND-DEPLOYMENT.md` for the exact integration steps already written.

---

### DEC-039 — Pilot Readiness audit: sidebar becomes a slide-in drawer below `md`, not a second persistent column
**Finding:** A live mobile-viewport (390×844) walkthrough — not just code review — showed the dashboard shell was unusable on a phone: `ProjectSidebar` was a fixed `w-56` column with no breakpoint, leaving roughly half the screen for actual content, and the header (workspace switcher, email, account link, sign-out) had no wrap/truncation, causing visible text overlap. This was the single most severe finding of the audit — five nonprofit pilot orgs starting "tomorrow" will have staff opening this on a phone.
**Decision:** `ProjectSidebar` (`components/project/project-sidebar.tsx`) is now a client component that, below `md`, renders as a `fixed` slide-in drawer (closed by default) toggled by a floating button, with a tap-to-close backdrop and auto-close on navigating to a project. At `md` and up it is unchanged — same always-visible `w-56` column. The dashboard header (`app/(dashboard)/layout.tsx`) gained `flex-wrap`, truncated/hidden the email on small screens, and the empty-state copy (`app/(dashboard)/[workspaceSlug]/page.tsx`) no longer says "from the sidebar" on mobile, since the sidebar isn't visible there by default.
**Rationale:** Resolves the open question logged below this entry's old location (mobile Kanban layout) — the Kanban board itself already had `overflow-x-auto` on its column row (Phase O), so columns scroll horizontally fine once they're not also fighting a permanently-visible sidebar for space. A drawer (rather than e.g. a bottom tab bar or a second navigation paradigm) was chosen because it reuses the exact same `ProjectSidebar` content and all its existing dialogs (Members, Audit log, Workspace settings, Archived projects) with zero duplication — only the container's visibility/position changes per breakpoint.
**Alternatives Considered:** A separate mobile-only nav component (rejected — duplicates every dialog trigger already in `ProjectSidebar`, doubling future maintenance); collapsing the sidebar into an accordion within the page flow instead of an overlay (rejected — pushes board/calendar content below the fold on every page load, worse than an opt-in drawer).
**Tradeoffs:** The drawer overlays the top header while open (covers it rather than sitting below it) — acceptable since it's a transient, explicitly-opened state with an obvious close affordance (backdrop tap or the toggle button itself), not a permanent layout change.
**Owner:** Product Engineer, UX Reviewer
**Date:** 2026-06-27 (Pilot Readiness audit)
**Future Revisit Conditions:** If pilot feedback shows users don't discover the floating toggle button, consider promoting it into the header row instead of a floating circular button.

---

### DEC-040 — Pilot Readiness audit: fixed a repeated silent-failure pattern across destructive/mutating actions
**Finding:** Grepping every component for `"success" in result` and checking whether the matching `"error" in result` branch existed turned up the same bug in roughly a dozen handlers: `project-settings-dialog.tsx` (archive/delete), `task-detail-dialog.tsx` (archive/delete), `archived-projects-dialog.tsx`/`archived-tasks-dialog.tsx` (restore), `workspace-members-dialog.tsx` (leave workspace, revoke invite), `audit-log-dialog.tsx` (CSV export), and `task-attachments.tsx`/`task-checklist.tsx`/`task-comments.tsx`/`task-label-picker.tsx` (delete). Each checked only the success case and did nothing on failure — clicking the button produced no visible feedback at all if the Server Action returned `{error}`. Several were worse than silent: `task-attachments.tsx`, `task-checklist.tsx`, and `task-comments.tsx`'s delete handlers applied an optimistic UI removal with no rollback, so a failed delete left the item looking gone while it still existed server-side (reappearing on refresh). `project-settings-dialog.tsx`'s `handleDelete` had no success path either — a *successful* delete left the user stranded on the now-nonexistent project's page.
**Decision:** Every handler above now mirrors the pattern already used correctly elsewhere in the codebase (`workspace-settings-dialog.tsx`, `task-checklist.tsx`'s own `handleToggle`): check `"error" in result` first, call `setError`/render a `role="alert"` message and (for the optimistic cases) roll back the local state, otherwise proceed. `project-settings-dialog.tsx`'s delete handler now navigates to the workspace root on success, matching its archive handler.
**Rationale:** This is a bug-fixing item under the Pilot Readiness audit (not a new feature) — a user clicking Archive/Delete/Restore/Leave/Revoke/Export and seeing nothing happen is exactly the kind of "looks broken" experience that erodes trust in a pilot's first week, and the rollback gaps are real data-consistency bugs, not just missing polish.
**Alternatives Considered:** A shared `useServerAction` hook to enforce this pattern everywhere going forward (rejected for this pass — out of scope for an audit-and-harden sprint per the explicit "do not add new features" instruction; worth proposing separately if this pattern recurs a third time, echoing DEC-035's framing for the sidebar header).
**Owner:** Product Engineer
**Date:** 2026-06-27 (Pilot Readiness audit)
**Future Revisit Conditions:** If a new mutating handler is added without an error branch, treat it as a regression of this fix, not a one-off — the grep used to find these (`grep -rln '"success" in result' components/`) is cheap to re-run before any release.

---

### DEC-041 — Sprint 4 Priority 3: `status` added directly to `projects`, not modeled as a new table or reusing `archived_at`
**Decision:** Migration 031 adds three columns to `projects`: `description text`, `due_date date`, and `status text not null default 'active' check (status in ('active','on_hold','completed'))`. No new RLS policy was needed — `"Admins and owners can update projects"` (migration 023) is a row-level policy with no column list, so it already covers the new columns. Edited via a new `updateProjectDetails` Server Action, surfaced through `ProjectSettingsDialog`, and displayed in the new rich `ProjectHeader`.
**Rationale:** `status` is a deliberately small, manually-set health indicator ("is this project actively being worked on") distinct from `archived_at`, which already means something specific and different (lifecycle/visibility — an archived project is hidden from the sidebar entirely). Conflating the two would mean an "on hold" project either has to stay fully visible with no way to flag it, or gets hidden via `archived_at` and loses the distinction between "paused" and "done with this, get it out of my way." A fixed three-value `check` constraint (not a new lookup table) matches this project's existing convention for small closed sets (see `tasks.priority`, `tasks.status` — both bare text columns with application-level validation, no enum type or lookup table).
**Alternatives Considered:** A Postgres `enum` type for `status` (rejected — this codebase consistently avoids enum types in favor of plain `text` + `check`, since altering a `check` constraint is a simple migration but altering a Postgres enum's values has historically required more ceremony); a separate `project_status_history` table (rejected — no requirement yet for tracking status changes over time, would be premature).
**Owner:** Product Engineer
**Date:** 2026-06-27 (Sprint 4)
**Future Revisit Conditions:** If a pilot org asks for more granular project stages (e.g. "planning," "in review"), extend the `check` constraint's value list rather than introducing a new table.

---

These are known gaps surfaced during planning that have **not** been resolved into a decision yet — listed here so they aren't mistaken for settled questions, and so a future contributor knows where leadership input is still needed:

- **Single-member workspaces vs. "shared with the whole team" messaging** (see DEC-011 / audit C-2) — needs an explicit Founder/PM call before pilot messaging goes out.

(Audit M-3's "no password-reset flow" gap was resolved in Sprint 1 — see `app/(auth)/forgot-password` and `app/(auth)/update-password` — and is removed from this list as stale.)

Do not treat any of the above as settled. If you resolve one, add it to the appropriate section above with a new `DEC-0##` ID rather than editing this list in place.
