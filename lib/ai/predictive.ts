import type {
  InsightCategory,
  InsightSeverity,
  PredictiveInsight,
  UserContext,
} from "@/lib/ai/types"
import {
  graphBlockedTasks,
  graphDueTodayTasks,
  graphMissingAssignees,
  graphOverdueTasks,
  graphOverloadedMembers,
  graphStaleTasks,
  type WorkspaceGraph,
} from "@/lib/ai/graph"

// ---------------------------------------------------------------
// Detectors — each returns PredictiveInsight[] for one category
// ---------------------------------------------------------------

function detectOverloadedMembers(
  g: WorkspaceGraph, _ctx: UserContext
): PredictiveInsight[] {
  return graphOverloadedMembers(g).map(({ member, open, overdue }) => ({
    id: `overloaded-${member.id}`,
    category: "overloaded_member",
    severity: overdue > 3 ? "critical" : overdue > 1 ? "high" : "medium",
    title: `${member.fullName} may be overloaded`,
    detail: `${open} open tasks (${overdue} overdue) — consider redistributing workload.`,
    evidence: ["Tasks", "Members"],
  }))
}

function detectUpcomingOverdue(
  g: WorkspaceGraph, _ctx: UserContext
): PredictiveInsight[] {
  const today = new Date().toISOString().split("T")[0]
  const in3Days = addDays(today, 3)

  const atRisk = g.tasks.filter(
    (t) =>
      !!t.due_date &&
      t.due_date >= today &&
      t.due_date <= in3Days &&
      t.status !== "done"
  )
  if (atRisk.length === 0) return []

  return [
    {
      id: `upcoming-overdue-${Date.now()}`,
      category: "upcoming_overdue",
      severity: atRisk.length > 5 ? "critical" : atRisk.length > 2 ? "high" : "medium",
      title: `${atRisk.length} task${atRisk.length > 1 ? "s" : ""} due in the next 3 days`,
      detail: atRisk.slice(0, 8).map((t) => `"${t.title}" (${t.due_date})`).join("; ") +
        (atRisk.length > 8 ? `; and ${atRisk.length - 8} more` : ""),
      evidence: ["Tasks"],
      relatedTaskIds: atRisk.map((t) => t.id),
    },
  ]
}

function detectAtRiskProjects(
  g: WorkspaceGraph, _ctx: UserContext
): PredictiveInsight[] {
  const today = new Date().toISOString().split("T")[0]
  const insights: PredictiveInsight[] = []

  for (const proj of g.projects) {
    const tasks = g.tasks.filter((t) => t.project_id === proj.id)
    if (tasks.length === 0) continue
    const done = tasks.filter((t) => t.status === "done").length
    const overdue = tasks.filter(
      (t) => !!t.due_date && t.due_date < today && t.status !== "done"
    ).length
    const pct = Math.round((done / tasks.length) * 100)
    const nearDue = !!proj.due_date && proj.due_date <= addDays(today, 7) && proj.due_date >= today

    if (pct < 30 && nearDue) {
      insights.push({
        id: `atrisk-${proj.id}`,
        category: "project_at_risk",
        severity: pct < 15 ? "critical" : "high",
        title: `"${proj.name}" is behind schedule`,
        detail: `${pct}% complete (${done}/${tasks.length}) with ${overdue} overdue. Due ${proj.due_date}.`,
        evidence: ["Projects", "Tasks"],
      })
    } else if (overdue > 5) {
      insights.push({
        id: `atrisk-overdue-${proj.id}`,
        category: "project_at_risk",
        severity: overdue > 10 ? "critical" : "high",
        title: `"${proj.name}" has ${overdue} overdue tasks`,
        detail: `Out of ${tasks.length} total tasks, ${overdue} are past due. Consider a reprioritization review.`,
        evidence: ["Projects", "Tasks"],
      })
    }
  }

  return insights
}

function detectBlockedChains(
  g: WorkspaceGraph, _ctx: UserContext
): PredictiveInsight[] {
  const blocked = graphBlockedTasks(g)
  if (blocked.length === 0) return []
  return [
    {
      id: `blocked-chains-${Date.now()}`,
      category: "dependency_chain",
      severity: blocked.length > 5 ? "critical" : blocked.length > 2 ? "high" : "medium",
      title: `${blocked.length} task${blocked.length > 1 ? "s are" : " is"} blocked by dependencies`,
      detail: blocked.slice(0, 5).map((t) => `"${t.title}" (${t.project_name})`).join("; ") +
        (blocked.length > 5 ? `; and ${blocked.length - 5} more` : ""),
      evidence: ["Tasks", "Dependencies"],
      relatedTaskIds: blocked.map((t) => t.id),
    },
  ]
}

function detectInactiveTasks(
  g: WorkspaceGraph, _ctx: UserContext
): PredictiveInsight[] {
  const stale = graphStaleTasks(g)
  if (stale.length === 0) return []
  const inactive14d = stale.filter((t) => t.status !== "done")
  if (inactive14d.length === 0) return []
  return [
    {
      id: `inactive-${Date.now()}`,
      category: "inactive_task",
      severity: inactive14d.length > 10 ? "medium" : "low",
      title: `${inactive14d.length} task${inactive14d.length > 1 ? "s" : ""} inactive for 14+ days`,
      detail: inactive14d.slice(0, 5).map((t) => `"${t.title}"`).join("; ") +
        (inactive14d.length > 5 ? `; and ${inactive14d.length - 5} more` : ""),
      evidence: ["Tasks", "Activity"],
    },
  ]
}

function detectUnassignedTasks(
  g: WorkspaceGraph, _ctx: UserContext
): PredictiveInsight[] {
  const unassigned = graphMissingAssignees(g)
  if (unassigned.length === 0) return []
  return [
    {
      id: `unassigned-${Date.now()}`,
      category: "missing_assignee",
      severity: "medium",
      title: `${unassigned.length} task${unassigned.length > 1 ? "s have" : " has"} no assignee`,
      detail: unassigned.slice(0, 5).map((t) => `"${t.title}" (${t.project_name})`).join("; ") +
        (unassigned.length > 5 ? `; and ${unassigned.length - 5} more` : ""),
      evidence: ["Tasks", "Members"],
    },
  ]
}

function detectNoActivity(
  g: WorkspaceGraph, _ctx: UserContext
): PredictiveInsight[] {
  const recentCount = g.recentActivity.length
  if (recentCount > 5) return []
  const last = g.recentActivity[0]
  return [
    {
      id: `no-activity-${Date.now()}`,
      category: "no_activity",
      severity: recentCount === 0 ? "high" : "low",
      title: recentCount === 0 ? "No recent activity detected" : "Low activity levels",
      detail: recentCount === 0
        ? "No audit-log entries found in the workspace. Nothing may have changed recently."
        : `Only ${recentCount} events since ${last.date}: "${last.action} ${last.entity}".`,
      evidence: ["Activity"],
    },
  ]
}

function detectStaleReviews(
  g: WorkspaceGraph, _ctx: UserContext
): PredictiveInsight[] {
  // Proxy: stale in_progress tasks with comments (potential PR reviews).
  const stale = g.tasks.filter(
    (t) =>
      t.status === "in_progress" &&
      t.commentCount > 0 &&
      t.updated_at < new Date(Date.now() - 7 * 86_400_000).toISOString()
  )
  if (stale.length === 0) return []
  return [
    {
      id: `late-review-${Date.now()}`,
      category: "late_review",
      severity: "medium",
      title: `${stale.length} work-in-progress task${stale.length > 1 ? "s" : ""} may need a review`,
      detail: stale.slice(0, 3).map((t) => `"${t.title}" (${t.commentCount} comments, last activity ${t.updated_at?.slice(0, 10) ?? "unknown"})`).join("; "),
      evidence: ["Tasks", "Comments", "Activity"],
    },
  ]
}

// ---------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------

export const ALL_DETECTORS: ((g: WorkspaceGraph, ctx: UserContext) => PredictiveInsight[])[] = [
  detectOverloadedMembers,
  detectUpcomingOverdue,
  detectAtRiskProjects,
  detectBlockedChains,
  detectInactiveTasks,
  detectUnassignedTasks,
  detectNoActivity,
  detectStaleReviews,
]

/**
 * Predictive Engine. Runs all detectors over the Relationship Graph and
 * returns ranked insights. The LLM surfaces these naturally in answers;
 * no separate "predict" prompt is needed.
 */
export function detectInsights(
  g: WorkspaceGraph,
  ctx: UserContext
): PredictiveInsight[] {
  const all: PredictiveInsight[] = []
  for (const d of ALL_DETECTORS) {
    try {
      all.push(...d(g, ctx))
    } catch {
      // Detector failure should not crash the engine.
    }
  }

  const severityOrder: Record<InsightSeverity, number> = {
    critical: 0, high: 1, medium: 2, low: 3,
  }
  all.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
  return all.slice(0, 10)
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}
