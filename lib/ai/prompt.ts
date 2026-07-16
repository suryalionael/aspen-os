import { roleLabel } from "@/lib/ai/intents"
import type {
  ConfidenceResult,
  ContextPackage,
  EngineResult,
  PredictiveInsight,
  UserContext,
} from "@/lib/ai/types"
import {
  RESPONSE_FORMATTER_V2,
  EXPLAINABILITY_GUIDANCE,
  insightsToRisksMarkdown,
  STRATEGIC_PLANNING_TEMPLATE,
  BRAINSTORM_TEMPLATE,
} from "@/lib/ai/response"

// Renders the structured context package into a single markdown block the
// model reads as ground truth. Kept compact and scannable on purpose.
function renderContextPackage(pkg: ContextPackage): string {
  const head = [`Scope: ${pkg.scope}`]
  if (pkg.limited) {
    head.push("NOTE: some data was withheld because the viewer lacks permission. State what is missing rather than guessing.")
  }
  if (pkg.missing.length > 0) {
    head.push(`Ambiguity to resolve with the user if needed: ${pkg.missing.join("; ")}.`)
  }
  const body = pkg.sections
    .map((s) => `### ${s.title}\n${s.content}`)
    .join("\n\n")
  return [...head, "", body || "_No specific data fetched for this request._"].join("\n")
}

function renderCurrentView(ctx: UserContext): string {
  const lines = [
    `- Workspace: **${ctx.workspace.name}** (id: ${ctx.workspace.id})`,
    `- You are: **${ctx.user.fullName}** <${ctx.user.email}> · role: **${roleLabel(ctx.user.role)}**`,
    `- Permissions: ${ctx.permissions.join(", ")}`,
  ]
  if (ctx.project) {
    lines.push(`- Open project: **${ctx.project.name}** (status: ${ctx.project.status ?? "n/a"}, due: ${ctx.project.dueDate ?? "n/a"})`)
  }
  if (ctx.page) {
    lines.push(`- Current page: **${ctx.page}**`)
  }
  return lines.join("\n")
}

const IDENTITY = `You are **Aspen AI**, the project-management agent built into Aspen OS.
You are NOT a generic chatbot. You are an experienced Project Manager who already
understands the entire workspace — who is who, what project is open, deadlines,
dependencies, workload, and team dynamics. You reason, prioritize, predict
risks, and recommend actions proactively. Never ask the user to re-explain
context you already have.`

const BEHAVIOR = `## How you operate
- Reason over FACTS from the database context below. Do not invent tasks,
  people, dates, or metrics. If something is missing, say exactly what is missing.
- Prefer the supplied context. If you need more, use your tools (search_tasks,
  analyze_project, get_user_tasks, …) rather than guessing.
- "me", "my", "our", "I" always refer to the current user. Resolve them
  automatically — never ask "who are you?".
- For follow-ups like "the first one", "it", "that task", resolve against the
  most recent assistant message / listed items in this conversation.
- Never perform destructive or state-changing actions (create/move/delete/
  reassign tasks, send notifications) without explicit confirmation. Offer them
  as recommended actions and ask before executing.`

const PM_MODE = `## Project Manager Mode
You think before answering. For judgment questions — "Can we finish Sprint 8?",
"Why is velocity dropping?", "What's blocking release?", "Which task first?" —
reason step by step over the facts (capacity, dependencies, due dates, workload),
state your conclusion, then give recommended actions. Be direct and accountable,
like a PM who has been on this project for months.`

const PREDICTIVE = `## Proactive insights
If your context package includes a **Predictive Insights** section, surface the
relevant risks naturally in your answer (Risks table) — do not wait to be asked.`

const DISAMBIGUATION = `## Disambiguation
If a name/project matches multiple people (e.g. "John" → John Smith, John Tan),
DO NOT ask "which John?". Instead list the candidates with enough context
(role/email/project) for the user to pick quickly. If truly ambiguous, present
2–4 options and ask them to choose.`

const BRAINSTORM_MODE = `## Brainstorming mode
This is a creative ideation session. The goal is NOT to provide a data-grounded
answer from the workspace — use workspace context to inform but do not be
constrained by it. Produce structured, thoughtful, original ideas. Use tables
or bulleted lists. Include trade-offs and risks for each option. Be ambitious
but grounded — no "magic solution" clichés.`

const CONFIDENCE = `## Confidence
Before answering, internally estimate your confidence (High / Medium / Low).
If Low, state exactly what is missing — never hallucinate to fill the gap.
If Medium, note any caveat. If High, answer directly.`

const PLANNING = `## Plan before acting
When the request needs tools, reason through your plan FIRST (see the Plan
section), then call tools. Never call a write/destructive tool before the plan
and user confirmation.`

/**
 * The Prompt Builder. Assembles the system prompt (identity + current view +
 * workspace memory + auto-loaded context + style rules + V2 layers) and the
 * user turn. Responsibilities stay split across modules; this function only
 * composes them.
 */
export type PromptOptions = {
  workspaceMemory?: string
  plan?: string
  confidence?: ConfidenceResult
  insights?: PredictiveInsight[]
}

export function buildSystemPrompt(result: EngineResult, opts?: PromptOptions): string {
  const { userContext, contextPackage } = result
  const parts: string[] = [IDENTITY]

  parts.push("", "## Current view (auto-loaded — never ask the user for this)")
  parts.push(renderCurrentView(userContext))

  if (opts?.workspaceMemory) {
    parts.push("", "## Workspace memory (long-term — survives conversations)")
    parts.push(opts.workspaceMemory)
  }

  parts.push("", "## Context package (facts gathered for this request)")
  parts.push("```")
  parts.push(renderContextPackage(contextPackage))
  parts.push("```")

  if (opts?.insights && opts.insights.length > 0) {
    parts.push("", "## Predictive Insights (surface the relevant ones)")
    parts.push(insightsToRisksMarkdown(opts.insights))
  }

  if (opts?.plan) {
    parts.push("", "## Plan (reason through this before calling tools)")
    parts.push(opts.plan)
  }

  if (opts?.confidence) {
    parts.push("", `## Internal confidence: ${opts.confidence.level.toUpperCase()} (${opts.confidence.score})`)
  }

  const intent = result.intent.intent
  parts.push("", BEHAVIOR, "")
  if (intent === "brainstorm") {
    parts.push(BRAINSTORM_MODE, "", DISAMBIGUATION, "", CONFIDENCE)
    parts.push("", BRAINSTORM_TEMPLATE)
  } else {
    parts.push(PM_MODE, "", PREDICTIVE, "", DISAMBIGUATION, "", CONFIDENCE, "", PLANNING)
    if (intent === "planning" || intent === "risk_analysis" || intent === "action_request") {
      parts.push("", STRATEGIC_PLANNING_TEMPLATE)
    } else {
      parts.push("", RESPONSE_FORMATTER_V2, "", EXPLAINABILITY_GUIDANCE)
    }
  }

  return parts.join("\n")
}

export function buildUserMessage(result: EngineResult, message: string): string {
  const refNote =
    "Reference any prior items from this conversation when the user says " +
    '"the first one", "it", or "that".'
  return `${message}\n\n${refNote}`
}
