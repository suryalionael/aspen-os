# Aspen AI — Features #5 & #6 Results

## Feature #5: Semantic Workspace Memory

Hybrid (SQL + vector) retrieval over workspace content. Enables the AI to answer semantically grounded questions.

### Architecture

```
User question
  │
  ├─ L0/L1 (simple) → skip (fast path handles these)
  └─ L2+ (reasoning)
       │
       ├─ embed question via OpenRouter (text-embedding-3-small)
       ├─ search ai_embeddings (pgvector cosine similarity)
       │    └─ optional SQL filter: workspace_id, project_id, source_type
       ├─ rank by similarity (threshold ≥ 0.5)
       └─ inject "Relevant Knowledge" section into prompt
```

### New files

| File | Purpose |
| --- | --- |
| `supabase/migrations/043_semantic_embeddings.sql` | pgvector extension + ai_embeddings table + RLS + match_embeddings RPC |
| `lib/ai/embeddings.ts` | Embedding generation, indexing, hybrid search service |

### Retrieval flow

1. `searchSimilar()` — embed query, call `match_embeddings` RPC with filters
2. Results include source_type & source_id for citation
3. Top-6 chunks injected as "Relevant knowledge" section
4. LLM sees source labels ("source: task#abc123", "source: note#def456")

### Hybrid

When a project is resolved from the user's question, `projectId` is passed as a filter. The SQL WHERE clause combines `workspace_id = X AND project_id = Y` with `embedding <=> query` ordering — only semantically relevant chunks within the right project are returned.

## Feature #6: Strategic Planning & Brainstorming

### Enhanced planner

| Intent | Template | Sections |
| --- | --- | --- |
| planning | STRATEGIC_PLANNING_TEMPLATE | Executive Summary, Today's Priorities, Risks, Suggested Plan, Why This Order, Optional Improvements |
| risk_analysis | Same | Same |
| action_request | Same | Same |
| brainstorm | BRAINSTORM_TEMPLATE | Thesis, Ideas (table), Recommendation, Next Steps |
| other | RESPONSE_FORMATTER_V2 (existing) | Summary, Metrics, Risks, Actions |

### Brainstorm mode

- New `brainstorm` intent (keywords: brainstorm, ideas, creative, think outside, imagine, what if, etc.)
- Routes to LLM (NOT fast path — verified by test)
- Uses BRAINSTORM_BEHAVIOR prompt (creative, exploratory, table-driven)
- Still sees workspace context if relevant, but is not constrained by it

### Files changed

| File | Change |
| --- | --- |
| `lib/ai/types.ts` | Added `brainstorm` to Intent union |
| `lib/ai/intents.ts` | Added brainstorm keywords + scores entry |
| `lib/ai/prompt.ts` | Added brainstorm prompt variant + strategic template conditional loading |
| `lib/ai/response.ts` | Added `STRATEGIC_PLANNING_TEMPLATE` + `BRAINSTORM_TEMPLATE` exports |
| `lib/ai/context.ts` | Thread `message` parameter to `buildContextPackage` |
| `lib/ai/context-builder.ts` | Added `message` param + semantic retrieval for L2+ intents |

### Tests

- `tests/ai/brainstorm.test.ts` — 7 new tests
- Existing 18 tests pass unchanged

## Performance

| Aspect | Impact |
| --- | --- |
| Semantic retrieval (L2+) | +1 embedding API call (~200-500ms) + 1 pgvector query (~5ms). Only for LLM-bound intents (fast path unaffected). |
| Strategic templates | Zero runtime cost (static strings). |
| Brainstorm routing | μs-scale (keyword scoring, deterministic). |

Future: embedding calls can be cached (same question → same embedding), and background indexing can eliminate lazy generation costs.

## Production verification

- lint ✔
- tsc ✔
- next build ✔
- 25/25 tests pass (18 existing + 7 new)
- deploy ✔
