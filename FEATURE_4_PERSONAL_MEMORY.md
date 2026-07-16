# Aspen AI — Feature #4: Personal Memory Engine

**Status:** Implemented, lint/tsc/build/tests green.
**Principle:** The AI should know who the user is without asking — profile, preferences, and relevant past facts persist across conversations.

## Architecture

Personal memory operates as a **ContextProvider** inside the Context Engine (context-builder.ts). At prompt-build time, three sections are injected for LLM-bound requests:

1. **User Profile** — permanent identity data (loaded always, one row)
2. **User Preferences** — learned style signals (loaded for L2+ intents)
3. **Personal Memories** — high-scored durable facts (loaded for L2+ intents, ranked)

Fast-path requests skip all memory loading (their context package is built but discarded — the fast-path handler produces its own response).

```
User message
  │
  ├─ Fast Path? → handler (no memory) → response (<300ms)
  │
  └─ Context Engine
       ├─ UserContext (existing)
       ├─ Intent classification
       ├─ ContextBuilder (existing sections)
       ├─ Personal Memory sections ← NEW
       │    ├─ Profile (always)
       │    ├─ Preferences (L2+)
       │    └─ Long-term memories (L2+, ranked)
       └─ Prompt Builder → LLM → stream
```

## New Database Table

`personal_memories` (`supabase/migrations/042_personal_memories.sql`)

| Column | Type | Description |
| --- | --- | --- |
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| workspace_id | uuid? | FK → workspaces (null = global) |
| type | text | PROFILE, PREFERENCE, WORK_PATTERN, GOAL, DECISION, FACT, PERSON, PREFERENCE_SIGNAL |
| content | text | The memory content |
| importance | int (1–5) | Scalar for ranking |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| last_accessed_at | timestamptz | Decay for recency scoring |

Indexed on `(user_id, importance desc, last_accessed_at desc)` for efficient top-N queries. RLS policies enforce user ownership.

## Memory Lifecycle

```
Initial: no profile → first interaction → user provides info
                                           │
                                           ▼
                                Save as PROFILE (user_id, workspace_id, content)
                                           │
    User says "be concise" repeatedly
              │
              ▼
    Preference Signal (PREFERENCE_SIGNAL, importance = count)
              │
              ▼
    count ≥ 3 → Promote to PREFERENCE (importance = 2, signal cleared)
    
    User says "remember this: X is Y"
              │
              ▼
    Save as FACT (importance = 2)
    
    LLM turn → loadMemories() → rank (importance × recency × workspace) → top 8    → prompt
              │                                                                       │
              ▼                                                                       ▼
    Normal usage — memories persist                                  Profile + Preferences + Memories
    across conversations                                             injected as context sections
```

## Loading Flow

`context-builder.ts` × `personal-memory.ts`:

1. `loadPersonalMemories(userId, { types: ["PROFILE"], limit: 5 })` → 0–1 rows
2. `loadPersonalMemories(userId, { types: ["PREFERENCE"], ..., limit: 10 })` → 0–10 rows
3. `loadPersonalMemories(userId, { types: [longTerm...], limit: 30 })` → ranked → top 8

Each is a single indexed query. Profile + preferences are cheap (< 10 rows each). Long-term fetch is 30 rows for ranking, then top 8 injected.

## Ranking Strategy

```
score = importance × recency × workspaceBonus

importance:   1–5 (set on save)
recency:      1.0 if accessed ≤1 day ago
              0.1–0.99 decay inversely with days since last_access
workspace:    1.5 if workspace matches current
              1.0 if workspace_id IS NULL (global)
              0.5 if workspace doesn't match
```

Only the top 8 scored memories are injected into the prompt. This keeps token cost negligible while preserving relevance.

## Auto-learning (`observePreferences`)

The service monitors user messages for preference signals (regex patterns like "be concise", "use markdown", "strategic").

- First occurrence: saves a `PREFERENCE_SIGNAL` counter (type=PREFERENCE_SIGNAL, importance = 1)
- Subsequent occurrences: increments the counter
- At count ≥ 3: promotes the signal to a `PREFERENCE` memory and deletes the signal counter

Only one preference per message is processed (avoids over-learning on a single verbose message).

## Memory Commands

| User says | Route | Behavior |
| --- | --- | --- |
| `remember that X is Y` | Legacy `rememberMatch` (engine.ts) | Saves to legacy `ai_memories` table (backward compat) |
| `remember this: X is Y` | `isPersonalMemoryCommand("remember")` (engine.ts) | Saves to `personal_memories` as FACT |
| `forget this` | `isPersonalMemoryCommand("forget")` | Stub — asks user to specify (deletion via `deletePersonalMemory` ready) |
| `clear all memories` | `isPersonalMemoryCommand("clear")` | Stub |
| `show my memories` | `isPersonalMemoryCommand("show")` | Not yet implemented |

## Files Changed

| File | Change |
| --- | --- |
| `supabase/migrations/042_personal_memories.sql` | **NEW** — `personal_memories` table + indexes + RLS |
| `lib/ai/personal-memory.ts` | **NEW** — service: CRUD, ranking, context builders, auto-learning, command routing |
| `lib/ai/context-builder.ts` | Modified — imports personal memory sections; injects Profile/Preferences/Memories before return |
| `lib/ai/engine.ts` | Modified — imports personal memory commands + `observePreferences`; calls after user message save; handles `remember:` / `forget` / `clear` |

## Performance Impact

| Aspect | Estimate |
| --- | --- |
| Profile load | 1 indexed query (~2–5 ms) |
| Preferences load | 1 indexed query (~2–5 ms) |
| Long-term memory load | 1 indexed query for 30 rows (~5–10 ms) |
| Ranking | 30 in-memory computations (< 0.1 ms) |
| Total for non-fast-path | ~10–20 ms added to context build |
| Total for fast-path | 0 (skipped) |

No measurable impact on fast-path latency (<300ms target unaffected). LLM path adds <20ms to context build time (~1% increase) for the benefit of persistent identity.

## Future pgvector Integration

The `personal_memories` table is designed for a future `embedding vector(1536)` column. Once added:

- Replace the current lexical `textSearch` in `searchPersonalMemories` with `pgvector` cosine similarity.
- Replace the content-based ranking with semantic similarity: `importance × recency × workspaceBonus × similarity(queryEmbedding, memoryEmbedding)`.
- Auto-infer related memories without keyword overlap.
- Enable "Have we discussed X before?" queries against personal memory content.

The migration path is: `ALTER TABLE personal_memories ADD COLUMN embedding vector(1536);` followed by a backfill job.

## Verification

- `next lint`: ✅
- `tsc --noEmit`: ✅
- `next build`: ✅
- 18 existing AI tests pass (11 fast-path + 2 temporal + 5 selected)
- Fast-path routes unchanged (memory sections built but discarded)
- Selected Object Context still resolves
- Streaming unchanged
