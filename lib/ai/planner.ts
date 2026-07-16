import type { ActionPlan, IntentResult, PlanStep, UserContext } from "@/lib/ai/types"

// Tools the planner may reference (must exist in AI_TOOLS).
const TOOL_BY_INTENT: Partial<Record<string, string>> = {
  task_query: "search_tasks",
  project_query: "analyze_project",
  sprint_query: "analyze_project",
  calendar_query: "get_user_tasks",
  member_query: "search_people",
  workspace_analytics: "get_task_summary",
  risk_analysis: "get_overdue_tasks",
  status_report: "get_task_summary",
  search: "search_tasks",
  planning: "get_user_tasks",
  action_request: "search_tasks",
}

const PLAN_TEMPLATES: Record<string, (e: IntentResult, ctx: UserContext) => PlanStep[]> = {
  task_query: (e) => [
    { order: 1, description: "Identify the scope (you vs workspace) and any project filter." },
    { order: 2, description: "Retrieve tasks ordered by priority (overdue → due today → blocked → high → in progress)." },
    { order: 3, description: e.entities.scopeMe ? "Filter to tasks assigned to you." : "Summarize the relevant set." },
  ],
  risk_analysis: () => [
    { order: 1, description: "Compute workload per member and flag overload." },
    { order: 2, description: "Detect overdue, urgent, and blocked tasks." },
    { order: 3, description: "Check dependency chains for blockers." },
    { order: 4, description: "Rank risks and propose rebalancing." },
  ],
  planning: () => [
    { order: 1, description: "List your open work, sorted by due date and priority." },
    { order: 2, description: "Estimate capacity vs upcoming deadlines." },
    { order: 3, description: "Propose an ordered 3–5 step plan." },
  ],
  project_query: () => [
    { order: 1, description: "Resolve the target project." },
    { order: 2, description: "Pull task completion, overdue, and upcoming dates." },
    { order: 3, description: "Assess health and surface recommendations." },
  ],
  status_report: () => [
    { order: 1, description: "Gather workspace workload and recent activity." },
    { order: 2, description: "Compute a health verdict (On Track / Attention / At Risk)." },
    { order: 3, description: "Summarize top risks and progress." },
  ],
  workspace_analytics: () => [
    { order: 1, description: "Aggregate tasks per member and per project." },
    { order: 2, description: "Highlight overdue clusters and bottlenecks." },
    { order: 3, description: "Report outliers." },
  ],
  action_request: (e) => [
    { order: 1, description: "Confirm the exact target (task / member / project)." },
    { order: 2, description: `Propose the change: ${e.entities.status ? "status=" + e.entities.status : "the requested action"}.` },
    { order: 3, description: "Ask for explicit confirmation before applying." },
  ],
  calendar_query: () => [
    { order: 1, description: "Resolve the date range from the request." },
    { order: 2, description: "Retrieve due/upcoming items in that window." },
    { order: 3, description: "Group by date and owner." },
  ],
}

/**
 * Action Planner. Separates planning from execution. Given an intent and
 * entities, it produces an ordered plan and the tools required — the model is
 * instructed to reason through the plan BEFORE calling any tool. Execution
 * only happens after the plan and (for mutations) user confirmation.
 */
export function buildPlan(
  intent: IntentResult,
  ctx: UserContext,
  availableTools: string[]
): ActionPlan {
  const steps =
    PLAN_TEMPLATES[intent.intent]?.(intent, ctx) ?? [
      { order: 1, description: "Understand the request and required data." },
      { order: 2, description: "Retrieve the minimal relevant context." },
      { order: 3, description: "Answer concisely with recommended actions." },
    ]

  const requiredTool = TOOL_BY_INTENT[intent.intent]
  const requiredTools = requiredTool && availableTools.includes(requiredTool) ? [requiredTool] : []

  const summary =
    intent.intent === "risk_analysis"
      ? "Assess workload, overdue, blocked, and capacity risks."
      : intent.intent === "planning"
      ? "Produce an ordered plan based on priorities and deadlines."
      : intent.intent === "action_request"
      ? "Plan the change and confirm before executing."
      : `Answer a ${intent.intent} request using the minimal relevant context.`

  return {
    intent: intent.intent,
    summary,
    steps,
    requiredTools,
    executeImmediately: false,
  }
}

export function planToPrompt(plan: ActionPlan): string {
  const lines = [
    `**Plan for this request** — ${plan.summary}`,
    "",
    plan.steps.map((s: PlanStep) => `${s.order}. ${s.description}`).join("\n"),
  ]
  if (plan.requiredTools.length) {
    lines.push("", `Required tools: ${plan.requiredTools.join(", ")}.`)
  }
  lines.push("", "Reason through this plan before calling any tool. Never call a write/destructive tool without explicit confirmation.")
  return lines.join("\n")
}
