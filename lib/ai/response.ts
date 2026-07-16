import type { Intent, IntentResult, PredictiveInsight } from "@/lib/ai/types"

// Intent-specific formatting guidance. The base style lives in prompt.ts; this
// layer tunes emphasis per request type so status reports, risk analyses, and
// action requests each land in the right shape.
const INTENT_GUIDANCE: Partial<Record<Intent, string>> = {
  status_report:
    "Lead with a one-line health verdict (On Track / Attention / At Risk), " +
    "then a metrics table, then the top 3 risks/blockers.",
  risk_analysis:
    "Quantify overload explicitly (open vs capacity). Call out overdue, " +
    "urgent, and blocked items. End with a rebalancing recommendation.",
  planning:
    "Output an ordered plan. Rank by due date and priority. Keep it to the " +
    "next concrete 3–5 moves.",
  action_request:
    "Restate the proposed action, its target (task/member/project), and ask " +
    "for explicit confirmation before anything changes. List alternatives.",
  workspace_analytics:
    "Use aggregate tables (per member / per project). Highlight outliers " +
    "(bottlenecks, idle members, overdue clusters).",
  calendar_query:
    "Group by date. Separate overdue from upcoming. Mention owners.",
  member_query:
    "Present the person's load and open items. Respect that you may only " +
    "suggest, not reassign, without confirmation.",
}

/**
 * The Response Formatter layer. Returns the formatting guidance string for a
 * given intent (appended to the system prompt) and provides a lightweight
 * post-processor that normalizes model output (trims noise, guarantees an
 * actionable closer when the intent is actionable). Heavy formatting is driven
 * by the prompt; this module enforces consistency and future tool/MCP hooks.
 */
export function responseGuidanceFor(intent: IntentResult): string {
  const base = INTENT_GUIDANCE[intent.intent]
  if (!base) return ""
  return `## Formatting emphasis for this request\n${base}`
}

export function postProcessResponse(
  text: string,
  intent: IntentResult
): string {
  let out = (text ?? "").trim()
  if (!out) return out

  // Future hook: when MCP/action tools are connected, this is where we would
  // validate that action intents end with a confirmation prompt, strip
  // disallowed content, or attach structured action payloads. Kept minimal
  // today to avoid mangling model-authored markdown.
  const actionable = intent.intent === "action_request" || intent.intent === "risk_analysis"
  if (actionable && !/confirm|should i|want me to|ok\?|\?$/i.test(out)) {
    out += "\n\n_Want me to take any of these actions? I'll confirm before changing anything._"
  }
  return out
}

// ---------------------------------------------------------------------------
// Response Formatter V2 — dashboard-style, tables-first, action-oriented
// ---------------------------------------------------------------------------

export const RESPONSE_FORMATTER_V2 = `## Response format (V2 — always use this)
Render every answer in this exact structure. Tables first, no essays.

**Summary**
One or two sentences of the key takeaway.

| Metric | Value |
| --- | --- |

**Relevant Items**

| Item | Owner | Status | Due |
| --- | --- | --- | --- |

**Risks**

| Level | Description |
| --- | --- | --- |

**Recommended Actions**

| Priority | Action | Expected Impact |
| --- | --- | --- |

**Available Actions**
End with a fenced block the UI renders as buttons:

\`\`\`aspen-actions
open_sprint:Open Sprint
reassign:Reassign Tasks
standup:Generate Standup
\`\`\`

Rules: skip any section with no data (write "_None_"). Never write long
paragraphs. Use badges: ✅ done · 🟡 in progress · ⬜ todo · ⚠️ overdue ·
🔴 urgent · 🟠 high.`

export function insightsToRisksMarkdown(insights: PredictiveInsight[]): string {
  if (!insights.length) return "_None_"
  const lines = ["| Level | Description |", "| --- | --- |"]
  for (const i of insights.slice(0, 6)) {
    const badge = i.severity === "critical" ? "🔴" : i.severity === "high" ? "🟠" : i.severity === "medium" ? "🟡" : "⚪"
    lines.push(`| ${badge} ${i.severity} | ${i.title} — ${i.detail} |`)
  }
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Explainability — surface evidence, not chain-of-thought
// ---------------------------------------------------------------------------

export const EXPLAINABILITY_GUIDANCE = `## Explainability
When the user asks "why", "how do you know", or "explain your reasoning",
respond with ONLY the evidence you used — the data sources, not your
internal chain-of-thought. Use this format:

**Evidence used**
- Projects (names, statuses)
- Tasks (counts, due dates)
- Activity (recent events)
- Dependencies (blocking edges)
- Comments (counts)
- Members (assignees)

Do NOT reveal reasoning steps or "I thought that…". List facts only.`

export function buildEvidenceBlock(sources: string[]): string {
  if (!sources.length) return "_No specific sources._"
  return "**Evidence used**\n" + sources.map((s) => `- ${s}`).join("\n")
}

// ---------------------------------------------------------------------------
// Available Actions extraction for the UI
// ---------------------------------------------------------------------------

export type ExtractedAction = { id: string; label: string }

/**
 * Parses a fenced ```aspen-actions block from the model output into UI buttons.
 * Returns the actions and the cleaned text (fence removed).
 */
export function extractActionHints(text: string): { text: string; actions: ExtractedAction[] } {
  const fence = text.match(/```aspen-actions\s*\n([\s\S]*?)```/)
  if (!fence) return { text, actions: [] }
  const actions: ExtractedAction[] = []
  for (const line of fence[1].split("\n")) {
    const m = line.match(/^([a-z0-9_]+)\s*:\s*(.+)$/i)
    if (m) actions.push({ id: m[1].trim(), label: m[2].trim() })
  }
  const cleaned = text.replace(fence[0], "").trim()
  return { text: cleaned, actions }
}
