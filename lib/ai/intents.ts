import type {
  AspenRole,
  Intent,
  IntentEntities,
  IntentResult,
  TemporalResult,
  UserContext,
} from "@/lib/ai/types"
import { parseTemporal } from "@/lib/ai/temporal"

const STATUSES = ["backlog", "todo", "in_progress", "done"]

// Keyword → intent scoring table. Deterministic and fast; no LLM call needed
// to decide what the user is asking about. The LLM still does the reasoning.
const INTENT_KEYWORDS: Record<Intent, string[]> = {
  brainstorm: [
    "brainstorm", "ideas", "creative", "think outside", "imagine",
    "what if we", "what would happen if", "suggest some", "come up with",
    "innovation", "innovate", "inspire", "inspiring", "help me think",
    "generate ideas", "10 ideas", "concept", "concepts", "possibilities",
    "reimagine", "rethink", "blue sky", "blue-sky",
  ],
  action_request: [
    "assign", "reassign", "unassign", "create", "add task", "new task",
    "reschedule", "move task", "update task", "delete task", "remove task",
    "send", "notify", "remind", "mark done", "complete", "set due",
    "change priority", "archive",
  ],
  risk_analysis: [
    "risk", "risky", "blocked", "blocking", "behind", "overloaded",
    "overloaded", "capacity", "at risk", "falling behind", "bottleneck",
    "too much", "stretched",
  ],
  calendar_query: [
    "calendar", "schedule", "scheduled", "meeting", "today", "tomorrow",
    "this week", "next week", "upcoming", "due", "deadline", "date",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
    "sunday", "overdue",
  ],
  planning: [
    "plan", "planning", "prioritize", "prioritise", "what should i",
    "what should we", "next steps", "roadmap", "recommend", "suggest",
    "where to start", "focus",
  ],
  status_report: [
    "status", "report", "standup", "update", "how are things", "how's it",
    "progress report", "summary of", "catch me up",
  ],
  workspace_analytics: [
    "analytics", "overview", "summary", "how are we", "health", "dashboard",
    "stats", "metrics", "breakdown", "everything", "whole workspace",
  ],
  sprint_query: [
    "sprint", "iteration", "milestone", "current sprint", "this sprint",
  ],
  project_query: [
    "project", "initiative", "this project", "current project", "the project",
  ],
  member_query: [
    "who", "member", "teammate", "teammates", "colleague", "owner of",
    "assigned to", "person", "people", "team",
  ],
  task_query: [
    "task", "tasks", "to-do", "todo", "to do", "my work", "my tasks",
    "assigned to me", "what do i", "open items", "checklist",
  ],
  search: [
    "find", "search", "look for", "where is", "show me", "list",
  ],
  general_chat: [
    "hello", "hi ", "hey", "thanks", "thank you", "who are you", "help",
    "what can you", "cool", "nice",
  ],
}

// Intents that are "about me / my work" when phrased personally.
const PERSONAL_PRONOUNS = ["my", "me", "i'm", "i am", "mine", "i have", "i've", "am i", "do i"]

function extractEntities(
  message: string,
  ctx: UserContext
): IntentEntities {
  const lower = message.toLowerCase()
  const scopeMe = PERSONAL_PRONOUNS.some((p) => lower.includes(p))

  // Project resolution: explicit name match, or "this/current project".
  let projectId: string | null = null
  let projectName: string | null = null
  if (/\b(this|current|the)\s+project\b/.test(lower) && ctx.project) {
    projectId = ctx.project.id
    projectName = ctx.project.name
  } else {
    for (const p of ctx.projects) {
      if (lower.includes(p.name.toLowerCase())) {
        projectId = p.id
        projectName = p.name
        break
      }
    }
  }

  // Member resolution: name/email match, or "me".
  let memberId: string | null = null
  let memberName: string | null = null
  if (scopeMe || /\bme\b/.test(lower)) {
    memberId = ctx.user.id
    memberName = ctx.user.fullName
  } else {
    for (const m of ctx.members) {
      const needle = (m.fullName + " " + m.email).toLowerCase()
      if (needle.includes(lower.replace(/[?.,!]/g, ""))) {
        // only count a member hit if a meaningful token matched
        const tokens = m.fullName.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
        if (tokens.some((t) => lower.includes(t))) {
          memberId = m.id
          memberName = m.fullName
          break
        }
      }
    }
  }

  const statusMatch = STATUSES.find((s) => lower.includes(s.replace("_", " ")) || lower.includes(s))
  const temporal: TemporalResult = parseTemporal(message)
  const keywords = lower.split(/\s+/).filter((w) => w.length > 3)

  return {
    scopeMe,
    projectId,
    projectName,
    memberId,
    memberName,
    status: statusMatch ?? null,
    dateToken: temporal.token,
    dateValue: temporal.value,
    temporal,
    keywords,
    selectedRef: ctx.selected && /\b(this|it|that|the selected|here|currently viewing|current)\b/i.test(lower)
      ? ctx.selected.kind
      : null,
  }
}

/**
 * The Intent Router. Classifies a user message into a primary intent (plus
 * secondary intents) and extracts structured entities used to scope the
 * Context Builder. Deterministic keyword scoring keeps latency low and
 * avoids burning an LLM call just to decide what the user meant.
 */
export function classifyIntent(message: string, ctx: UserContext): IntentResult {
  const lower = message.toLowerCase().trim()
  const scores: Record<Intent, number> = {
    task_query: 0,
    project_query: 0,
    sprint_query: 0,
    calendar_query: 0,
    member_query: 0,
    workspace_analytics: 0,
    planning: 0,
    risk_analysis: 0,
    status_report: 0,
    search: 0,
    action_request: 0,
    brainstorm: 0,
    general_chat: 0,
  }

  let bestReason = "default fallback"
  for (const [intent, words] of Object.entries(INTENT_KEYWORDS)) {
    for (const w of words) {
      if (lower.includes(w)) {
        scores[intent as Intent] += w.includes(" ") ? 2 : 1
        bestReason = `matched "${w}" → ${intent}`
      }
    }
  }

  // Contextual boosts.
  const entities = extractEntities(message, ctx)
  if (entities.scopeMe) {
    scores.task_query += 1
    scores.planning += 1
  }
  if (entities.projectId) {
    scores.project_query += 2
    scores.task_query += 1
  }
  if (entities.memberId && entities.memberId !== ctx.user.id) {
    scores.member_query += 3
  }
  if (entities.dateToken === "overdue") {
    scores.task_query += 2
    scores.calendar_query += 2
  }

  // Very short greetings / thanks are general chat.
  if (lower.split(/\s+/).length <= 3 && scores.general_chat > 0 && scores.action_request === 0) {
    scores.general_chat += 2
  }

  const ranked = (Object.entries(scores) as [Intent, number][])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])

  const primary: Intent = ranked[0]?.[0] ?? "general_chat"
  const primaryScore = ranked[0]?.[1] ?? 0
  const secondary = ranked.slice(1, 3).map(([i]) => i)
  const total = Object.values(scores).reduce((a, b) => a + b, 0)
  const confidence = total > 0 ? Math.min(1, primaryScore / Math.max(total, primaryScore + 1)) : 0.4

  return {
    intent: primary,
    secondary,
    confidence,
    entities,
    reason: bestReason,
  }
}

export function isOwnerOrAdmin(ctx: UserContext): boolean {
  return ctx.user.role === "owner" || ctx.user.role === "admin"
}

export function roleLabel(role: AspenRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}
