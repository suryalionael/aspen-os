import type { ContextLevel, IntentResult, PriorityTier, UserContext } from "@/lib/ai/types"

// Context budgets — never load more than needed for the request level.
export const MAX_TOKENS_BY_LEVEL: Record<ContextLevel, number> = {
  L0: 100,
  L1: 800,
  L2: 2000,
  L3: 3500,
  L4: 5000,
  L5: 7000,
  L6: 12000,
}

export function contextLevelFor(intent: IntentResult, _ctx: UserContext): ContextLevel {
  const i = intent.intent
  if (i === "general_chat") return "L0"
  if (i === "member_query" || i === "task_query" || i === "search") return "L1"
  if (i === "project_query" || i === "calendar_query") return "L2"
  if (i === "sprint_query") return "L3"
  if (i === "workspace_analytics" || i === "status_report") return "L4"
  if (i === "planning") return "L5"
  if (i === "risk_analysis" || i === "action_request") return "L6"
  return "L1"
}

// Priority tiers from highest to lowest importance.
const TIER_ORDER: PriorityTier[] = [
  "overdue",
  "due_today",
  "blocked",
  "high",
  "in_progress",
  "upcoming",
  "other",
]

const TIER_RANK: Record<PriorityTier, number> = {
  overdue: 0,
  due_today: 1,
  blocked: 2,
  high: 3,
  in_progress: 4,
  upcoming: 5,
  other: 6,
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0]
}

/**
 * Assigns a priority tier to a task based on its due date, status, and
 * priority field. This is the core function of the Context Priority Engine:
 * the AI never wastes tokens on low-value context first.
 */
export function taskPriorityTier(task: {
  due_date?: string | null
  status?: string
  priority?: string | null
  blocked?: boolean
}): PriorityTier {
  const today = todayISO()
  const isOverdue = !!task.due_date && task.due_date < today && task.status !== "done"
  const isDueToday = task.due_date === today
  const isBlocked = !!task.blocked
  const isUrgent = task.priority === "urgent" && task.status !== "done"
  const isHigh = task.priority === "high" && task.status !== "done"
  const isInProgress = task.status === "in_progress"
  const isUpcoming = !!task.due_date && task.due_date > today && task.due_date <= addDays(today, 7)

  if (isOverdue && isUrgent) return "overdue"
  if (isOverdue) return "overdue"
  if (isDueToday) return "due_today"
  if (isBlocked) return "blocked"
  if (isUrgent) return "high" // urgent without overdue is still high
  if (isHigh) return "high"
  if (isInProgress) return "in_progress"
  if (isUpcoming) return "upcoming"
  return "other"
}

/**
 * Stable sort: tasks are ordered by priority tier, then within each tier
 * by due date (ascending). This ensures high-value context surfaces first
 * in the prompt regardless of the order the database returned.
 */
export function sortTasksByPriority<T extends { due_date?: string | null; status?: string; priority?: string | null; blocked?: boolean }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const ta = TIER_RANK[taskPriorityTier(a)] ?? 99
    const tb = TIER_RANK[taskPriorityTier(b)] ?? 99
    if (ta !== tb) return ta - tb
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}
