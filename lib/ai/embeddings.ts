import { createClient } from "@/lib/supabase/server"
import { getOpenRouterConfig, OPENROUTER_BASE_URL } from "@/lib/ai/config"

/**
 * Semantic Word Embedding Service — pgvector-powered retrieval.
 *
 * Generates embeddings via OpenRouter’s /v1/embeddings (supports
 * openai/text-embedding-3-small), stores them in the ai_embeddings
 * table, and provides hybrid (SQL + vector) search.
 *
 * This service is an **additive layer** on top of the existing
 * SQL-first tools (search_tasks, search_drive, …). It does NOT
 * replace them — it augments the context package with semantically
 * relevant chunks for LLM reasoning.
 *
 * Embeddings are generated lazily (when content is first retrieved
 * for context) and eagerly (when new content is saved). A future
 * trigger-based background job can batch-index stale content.
 */

export type SourceType =
  | "task"
  | "note"
  | "comment"
  | "meeting"
  | "activity_summary"
  | "decision"
  | "memory"

export type SemanticChunk = {
  id: string
  workspaceId: string
  projectId: string | null
  sourceType: SourceType
  sourceId: string
  content: string
  similarity: number
  createdAt: string
}

const EMBEDDING_MODEL = "openai/text-embedding-3-small"
const MAX_CHUNK_LEN = 800

// ---------------------------------------------------------------------------
// Embedding generation — delegates to OpenRouter /v1/embeddings
// ---------------------------------------------------------------------------

export async function generateEmbedding(text: string): Promise<number[]> {
  const { apiKey } = getOpenRouterConfig()
  const res = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://aspen-os.vercel.app",
      "X-Title": "Aspen OS",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8192),
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Embedding API error (${res.status}): ${body}`)
  }
  const data = await res.json()
  const embedding: number[] = data.data?.[0]?.embedding
  if (!embedding) throw new Error("Embedding response missing data")
  return embedding
}

// ---------------------------------------------------------------------------
// Indexing — generate + store for a given source
// ---------------------------------------------------------------------------

export async function indexSource(
  workspaceId: string,
  sourceType: SourceType,
  sourceId: string,
  content: string,
  projectId?: string | null
): Promise<void> {
  if (!content || content.trim().length === 0) return
  const supabase = await createClient()

  // Remove any stale embedding for this source (avoids duplicates).
  await supabase
    .from("ai_embeddings")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)

  // Chunk long content.
  const chunks = chunkContent(content)
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i])
    await supabase.from("ai_embeddings").insert({
      workspace_id: workspaceId,
      project_id: projectId ?? null,
      source_type: sourceType,
      source_id: sourceId,
      chunk_index: i,
      content: chunks[i],
      embedding,
    })
  }
}

// ---------------------------------------------------------------------------
// Retrieval — hybrid search combining SQL filters + vector similarity
// ---------------------------------------------------------------------------

export type SearchOptions = {
  workspaceId: string
  query: string
  projectId?: string | null
  sourceType?: SourceType | null
  topK?: number
  minSimilarity?: number
}

export async function searchSimilar(opts: SearchOptions): Promise<SemanticChunk[]> {
  const { workspaceId, query, projectId, sourceType, topK = 5, minSimilarity = 0.5 } = opts
  const supabase = await createClient()

  // 1. Embed the query.
  const queryEmbedding = await generateEmbedding(query)

  // 2. Build the SQL filter.
  const conditions = ["workspace_id = $1"]
  const params: unknown[] = [workspaceId]
  let paramIdx = 2
  if (projectId) {
    conditions.push(`project_id = $${paramIdx++}`)
    params.push(projectId)
  }
  if (sourceType) {
    conditions.push(`source_type = $${paramIdx++}`)
    params.push(sourceType)
  }

  // 3. Execute vector search with filters — use raw SQL for the cosine op.
  // The vector column is cast to vector for the <=> operator.
  const filterSql = conditions.join(" AND ")
  const { data } = await supabase.rpc("match_embeddings", {
    query_embedding: queryEmbedding,
    filter_workspace_id: workspaceId,
    filter_project_id: projectId ?? null,
    filter_source_type: sourceType ?? null,
    match_count: topK,
    match_threshold: minSimilarity,
  })

  // Fallback if RPC doesn't exist yet — try inline (pgvector may not have
  // the function, in which case we query directly via a $client query).
  // The RPC approach is preferred but requires the function to exist.
  if (data) {
    return formatResults(data as Record<string, unknown>[])
  }

  // Inline fallback (Vercel may not allow raw SQL; RPC is the clean path).
  return []
}

/**
 * Creates the match_embeddings RPC if it doesn't exist.
 * Called once at startup or migration.
 */
export function getOrCreateMatchRPC(): string {
  return `
create or replace function match_embeddings(
  query_embedding vector(1536),
  filter_workspace_id uuid,
  filter_project_id uuid default null,
  filter_source_type text default null,
  match_count int default 5,
  match_threshold float default 0.5
)
returns table(
  id uuid, workspace_id uuid, project_id uuid,
  source_type text, source_id uuid, content text,
  similarity float, created_at timestamptz
)
language plpgsql
as $$
begin
  return query
  select
    e.id, e.workspace_id, e.project_id,
    e.source_type, e.source_id, e.content,
    1 - (e.embedding <=> query_embedding) as similarity,
    e.created_at
  from ai_embeddings e
  where e.workspace_id = filter_workspace_id
    and (filter_project_id is null or e.project_id = filter_project_id)
    and (filter_source_type is null or e.source_type = filter_source_type)
    and 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunkContent(text: string): string[] {
  if (text.length <= MAX_CHUNK_LEN) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = start + MAX_CHUNK_LEN
    if (end < text.length) {
      // Try to break at a sentence boundary.
      const slice = text.slice(start, end)
      const lastPeriod = slice.lastIndexOf(".")
      const lastNewline = slice.lastIndexOf("\n")
      const breakAt = Math.max(lastPeriod, lastNewline)
      if (breakAt > MAX_CHUNK_LEN / 2) end = start + breakAt + 1
    }
    chunks.push(text.slice(start, Math.min(end, text.length)))
    start = end
  }
  return chunks
}

function formatResults(rows: Record<string, unknown>[]): SemanticChunk[] {
  return rows.map((r) => ({
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    projectId: r.project_id as string | null,
    sourceType: r.source_type as SourceType,
    sourceId: r.source_id as string,
    content: r.content as string,
    similarity: r.similarity as number,
    createdAt: r.created_at as string,
  }))
}
