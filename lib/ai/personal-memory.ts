import { createClient } from "@/lib/supabase/server"

/**
 * Personal Memory Service — durable, rankable, per-user memory.
 *
 * Every turn loads only the highest-scoring memories (importance × recency ×
 * workspace relevance) so the prompt stays compact while the assistant feels
 * like it has known the user for months.
 *
 * Four tiers:
 *   1. Profile — permanent identity (loaded always, one row)
 *   2. Preferences — learned style signals (loaded for LLM turns)
 *   3. Long-term memories — scored facts (loaded for LLM turns, ranked)
 *   4. Preference signals — ephemeral counters for auto-learning
 */

export type MemoryType =
  | "PROFILE"
  | "PREFERENCE"
  | "WORK_PATTERN"
  | "GOAL"
  | "DECISION"
  | "FACT"
  | "PERSON"
  | "PREFERENCE_SIGNAL"

export type PersonalMemory = {
  id: string
  userId: string
  workspaceId: string | null
  type: MemoryType
  content: string
  importance: number
  createdAt: string
  updatedAt: string
  lastAccessedAt: string
}

// Regular expressions that signal a user preference when they appear in
// the user's message. Each pattern maps to a suggested PREFERENCE content.
const PREFERENCE_SIGNALS: { pattern: RegExp; content: string }[] = [
  { pattern: /\bbe\s+concise\b|\banswer\s+briefly\b|\bshort\s+answer\b/i, content: "Prefers concise answers" },
  { pattern: /\buse\s+markdown\b|\bformat\s+as\s+markdown\b/i, content: "Prefers markdown formatting" },
  { pattern: /\bbe\s+(more\s+)?structured\b|\buse\s+tables\b|\buse\s+bullets\b/i, content: "Prefers structured, tabular answers" },
  { pattern: /\bstrategic\b|\bstrategy\b|\bplanning\b/i, content: "Prefers strategic planning perspective" },
  { pattern: /\bkanban\b|\bboard\b|\bcard\b/i, content: "Prefers Kanban-style task management" },
  { pattern: /\benglish\b|\bin\s+english\b/i, content: "Prefers English" },
  { pattern: /\b(brief|short)\s+summary\b/i, content: "Prefers brief summaries over detailed reports" },
]

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function loadPersonalMemories(
  userId: string,
  opts?: {
    workspaceId?: string | null
    types?: MemoryType[]
    limit?: number
  }
): Promise<PersonalMemory[]> {
  const supabase = await createClient()
  let q = supabase
    .from("personal_memories")
    .select("*")
    .eq("user_id", userId)

  if (opts?.workspaceId) q = q.eq("workspace_id", opts.workspaceId)
  if (opts?.types?.length) q = q.in("type", opts.types)

  q = q
    .order("importance", { ascending: false })
    .order("last_accessed_at", { ascending: false })
    .limit(opts?.limit ?? 20)

  const { data } = await q
  return ((data ?? []) as PersonalMemory[]).map(normalize)
}

export async function savePersonalMemory(
  userId: string,
  opts: {
    workspaceId?: string | null
    type: MemoryType
    content: string
    importance?: number
  }
): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("personal_memories")
    .insert({
      user_id: userId,
      workspace_id: opts.workspaceId ?? null,
      type: opts.type,
      content: opts.content,
      importance: opts.importance ?? 1,
    })
    .select("id")
    .single()

  if (error || !data) throw new Error(error?.message ?? "Failed to save personal memory")
  return data.id
}

export async function updatePersonalMemory(
  id: string,
  updates: { content?: string; importance?: number }
): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from("personal_memories")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
}

export async function deletePersonalMemory(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from("personal_memories").delete().eq("id", id)
}

export async function searchPersonalMemories(
  userId: string,
  query: string
): Promise<PersonalMemory[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("personal_memories")
    .select("*")
    .eq("user_id", userId)
    .textSearch("content", query, { type: "plain" })
    .limit(10)

  return ((data ?? []) as PersonalMemory[]).map(normalize)
}

// ---------------------------------------------------------------------------
// Ranking — importance × recency × workspace relevance
// ---------------------------------------------------------------------------

export function rankMemories(
  memories: PersonalMemory[],
  workspaceId: string | null
): PersonalMemory[] {
  const now = Date.now()
  const scored = memories.map((m) => {
    const daysSinceAccess = (now - new Date(m.lastAccessedAt).getTime()) / 86_400_000
    const recency = daysSinceAccess <= 1 ? 1 : Math.max(0.1, 1 / daysSinceAccess)
    const workspaceBonus = workspaceId && m.workspaceId === workspaceId ? 1.5 : m.workspaceId === null ? 1 : 0.5
    const score = m.importance * recency * workspaceBonus
    return { ...m, _score: score }
  })
  scored.sort((a, b) => b._score - a._score)
  return scored
}

// ---------------------------------------------------------------------------
// Context section builders — used by the Context Engine
// ---------------------------------------------------------------------------

export async function loadProfileSection(userId: string, workspaceId: string): Promise<string | null> {
  const mems = await loadPersonalMemories(userId, { types: ["PROFILE"], limit: 5 })
  if (mems.length === 0) return null
  const entries = mems.map((m) => `- **${m.type}:** ${m.content}`).join("\n")
  return entries
}

export async function loadPreferenceSection(userId: string, workspaceId: string): Promise<string | null> {
  const mems = await loadPersonalMemories(userId, { workspaceId, types: ["PREFERENCE"], limit: 10 })
  if (mems.length === 0) return null
  const entries = mems.map((m) => `- ${m.content}`).join("\n")
  return `**User preferences**\n${entries}`
}

export async function loadLongTermMemorySection(
  userId: string,
  workspaceId: string,
  limit = 8
): Promise<string | null> {
  const mems = await loadPersonalMemories(userId, {
    types: ["WORK_PATTERN", "GOAL", "DECISION", "FACT", "PERSON"],
    limit: 30,
  })
  const ranked = rankMemories(mems, workspaceId)
  const top = ranked.slice(0, limit)
  if (top.length === 0) return null
  const entries = top.map((m) => `- ${m.content}`).join("\n")
  return `**Relevant memories**\n${entries}`
}

// ---------------------------------------------------------------------------
// Auto-learning — detect repeated preference signals
// ---------------------------------------------------------------------------

const SIGNAL_THRESHOLD = 3

/**
 * Examines the user's message for known preference signal patterns.
 * Each strong hit increments a PREFERENCE_SIGNAL counter (stored
 * in personal_memories). When a signal reaches ≥3 occurrences it
 * is promoted to a PREFERENCE memory and the signals are cleared.
 */
export async function observePreferences(
  userId: string,
  workspaceId: string,
  message: string
): Promise<void> {
  for (const { pattern, content } of PREFERENCE_SIGNALS) {
    if (!pattern.test(message)) continue

    const supabase = await createClient()

    // Increment or create a signal counter (type = PREFERENCE_SIGNAL)
    const signalKey = content.slice(0, 80)
    const { data: existing } = await supabase
      .from("personal_memories")
      .select("*")
      .eq("user_id", userId)
      .eq("type", "PREFERENCE_SIGNAL")
      .eq("content", signalKey)
      .maybeSingle()

    if (existing) {
      const newCount = (existing.importance ?? 0) + 1
      if (newCount >= SIGNAL_THRESHOLD) {
        // Promote to permanent preference
        await supabase.from("personal_memories").insert({
          user_id: userId,
          workspace_id: workspaceId,
          type: "PREFERENCE",
          content,
          importance: 2,
        })
        // Clear signal
        await supabase.from("personal_memories").delete().eq("id", existing.id)
      } else {
        await supabase
          .from("personal_memories")
          .update({
            importance: newCount,
            updated_at: new Date().toISOString(),
            last_accessed_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
      }
    } else {
      // First signal
      await supabase.from("personal_memories").insert({
        user_id: userId,
        workspace_id: workspaceId,
        type: "PREFERENCE_SIGNAL",
        content: signalKey,
        importance: 1,
      })
    }
    // Only one preference per message to avoid over-learning
    break
  }
}

// ---------------------------------------------------------------------------
// "Remember this" / "Forget this" command routing
// ---------------------------------------------------------------------------

export function isPersonalMemoryCommand(message: string): "remember" | "forget" | "clear" | "show" | null {
  const lower = message.toLowerCase().trim()
  if (/^remember(\s+this)?\s/i.test(lower)) return "remember"
  if (/^forget(\s+this)?\s/i.test(lower)) return "forget"
  if (/^clear\s+(all\s+)?(memories|memory)/i.test(lower)) return "clear"
  if (/^show\s+(my\s+)?memories/i.test(lower)) return "show"
  return null
}

export function parseRememberContent(message: string): { content: string; type?: MemoryType } | null {
  // "remember this: X is Y"
  const colon = message.indexOf(":")
  if (colon > 10) {
    return { content: message.slice(colon + 1).trim(), type: "FACT" }
  }
  // "remember that X is Y"
  const m = message.match(/^remember\s+(?:that\s+)?(.+?)(?:\s+is\s+|\s+will\s+be\s+|\s*:\s*)(.+)/i)
  if (m) return { content: `${m[1].trim()} → ${m[2].trim()}`, type: "FACT" }
  return null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize(raw: Record<string, unknown>): PersonalMemory {
  return {
    id: raw.id as string,
    userId: raw.user_id as string,
    workspaceId: raw.workspace_id as string | null,
    type: raw.type as MemoryType,
    content: raw.content as string,
    importance: raw.importance as number,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
    lastAccessedAt: raw.last_accessed_at as string,
  }
}
