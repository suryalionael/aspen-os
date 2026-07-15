import { createClient } from "@/lib/supabase/server"
import { memberEmailById } from "@/lib/ai/user-context"
import type { IntentEntities, UserContext } from "@/lib/ai/types"

/**
 * Fast Path Engine — deterministic, LLM-free request handling.
 *
 * A small set of high-frequency, fully-structured questions (my tasks,
 * overdue, blocked, project status, workspace health, …) are answered
 * directly from SQL + a fixed formatter. No LLM call, no prompt
 * build, no plan — so they return in <300ms and do not consume
 * token budget.
 *
 * Pluggable by design: support a new fast intent by (1) adding a
 * `FastKind`, (2) a `case` in `routeFastPath`, and (3) a handler
 * in `FAST_HANDLERS`. Nothing else changes.
 */

export type FastKind =
  | "my_tasks"
  | "due_today"
  | "overdue"
  | "blocked"
  | "project_status"
  | "workspace_health"
  | "my_workload"
  | "recent_activity"
  | "calendar_today"

type FpTask = {
  id: string
  title: string
  status: string
  due_date: string | null
  priority: string | null
  assignee_ids: string[]
  project_name: string
}

type FpReq = { workspaceId: string; projectId?: string | null }

// ---------------------------------------------------------------------------
// Routing — pure, no IO. Returns the fast kind or null (→ fall through to LLM).
// ---------------------------------------------------------------------------

export function routeFastPath(
  message: string,
  intent: string,
  e: IntentEntities
): FastKind | null {
  const lower = message.toLowerCase()

  if (intent === "task_query" && e.scopeMe && !e.dateToken) return "my_tasks"
  if ((intent === "task_query" || intent === "calendar_query") && e.dateToken === "today")
    return "due_today"
  if ((intent === "task_query" || intent === "calendar_query") && e.dateToken === "overdue")
    return "overdue"
  if (intent === "risk_analysis") return "blocked"
  if (intent === "project_query") return "project_status"
  if (intent === "workspace_analytics" || intent === "status_report")
    return /activity|recent|log|history/.test(lower) ? "recent_activity" : "workspace_health"
  if (intent === "planning" && e.scopeMe) return "my_workload"
  if (intent === "calendar_query") return "calendar_today"
  return null
}

// ---------------------------------------------------------------------------
// Lightweight data access (targeted, indexed queries — no graph rebuild)
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().split("T")[0]
}

type RawTask = {
  id: string
  title: string
  status: string
  due_date: string | null
  priority: string | null
  assignee_id: string | null
  project_id: string
  projects: { name: string } | { name: string }[] | null
  task_assignees: { user_id: string }[] | null
  task_labels: { labels: { name: string; color: string } | { name: string; color: string }[] }[] | null
}

function normalize(raw: RawTask, userId: string): FpTask {
  const assignees = (raw.task_assignees ?? []).map((a) => a.user_id)
  if (raw.assignee_id && !assignees.includes(raw.assignee_id)) assignees.push(raw.assignee_id)
  const p = raw.projects
  const project_name = Array.isArray(p) ? p[0]?.name ?? "Unknown" : p?.name ?? "Unknown"
  return {
    id: raw.id,
    title: raw.title,
    status: raw.status,
    due_date: raw.due_date,
    priority: raw.priority,
    assignee_ids: assignees,
    project_name,
  }
}

async function fpProjectIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
  return (data ?? []).map((p: { id: string }) => p.id)
}

async function fpFetchTasks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  opts: { projectId?: string | null; dueOn?: string; dueBefore?: string; limit?: number }
): Promise<FpTask[]> {
  const projectIds = opts.projectId
    ? [opts.projectId]
    : await fpProjectIds(supabase, workspaceId)
  if (projectIds.length === 0) return []

  let q = supabase
    .from("tasks")
    .select(
      "id, title, status, due_date, priority, assignee_id, project_id, projects(name), task_assignees(user_id), task_labels(labels(name, color))"
    )
    .in("project_id", projectIds)
    .is("archived_at", null)

  if (opts.dueOn) q = q.eq("due_date", opts.dueOn)
  if (opts.dueBefore) q = q.lt("due_date", opts.dueBefore)

  const { data } = await q
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50)

  return ((data ?? []) as unknown as RawTask[]).map((r) => normalize(r, ""))
}

async function fpBlocked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  projectId?: string | null
): Promise<FpTask[]> {
  const tasks = await fpFetchTasks(supabase, workspaceId, { projectId, limit: 300 })
  if (tasks.length === 0) return []

  const { data: deps } = await supabase
    .from("task_dependencies")
    .select("dependent_task_id, dependency_task_id")
    .in(
      "dependent_task_id",
      tasks.map((t) => t.id)
    )
  if (!deps || deps.length === 0) return []

  const depIds = Array.from(new Set((deps ?? []).map((d: { dependency_task_id: string }) => d.dependency_task_id)))
  const { data: depStatus } = await supabase
    .from("tasks")
    .select("id, status")
    .in("id", depIds)
  const done = new Set(
    (depStatus ?? [])
      .filter((t: { status: string }) => t.status === "done")
      .map((t: { id: string }) => t.id)
  )
  const blockedIds = new Set(
    (deps ?? [])
      .filter((d: { dependency_task_id: string }) => !done.has(d.dependency_task_id))
      .map((d: { dependent_task_id: string }) => d.dependent_task_id)
  )
  return tasks.filter((t) => blockedIds.has(t.id) && t.status !== "done")
}

// ---------------------------------------------------------------------------
// Formatting — identical to Aspen's RESPONSE_FORMATTER_V2 shape
// ---------------------------------------------------------------------------

function statusBadge(s: string): string {
  switch (s) {
    case "done": return "✅ done"
    case "in_progress": return "🟡 in progress"
    case "todo": return "⬜ todo"
    case "backlog": return "📦 backlog"
    default: return s
  }
}

function priorityBadge(p: string | null): string {
  if (!p) return ""
  switch (p) {
    case "urgent": return "🔴 urgent"
    case "high": return "🟠 high"
    case "medium": return "🟡 medium"
    case "low": return "⚪ low"
    default: return p
  }
}

function taskTable(tasks: FpTask[], ctx: UserContext, limit = 25): string {
  if (tasks.length === 0) return "_None_"
  const sorted = [...tasks].sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
  const lines = [
    "| Task | Project | Owner | Status | Due | Priority |",
    "| --- | --- | --- | --- | --- | --- |",
  ]
  for (const t of sorted.slice(0, limit)) {
    const owners = t.assignee_ids.map((id) => memberEmailById(ctx, id) ?? "unassigned").join(", ") || "unassigned"
    lines.push(
      `| ${t.title} | ${t.project_name} | ${owners} | ${statusBadge(t.status)} | ${t.due_date ?? "—"} | ${priorityBadge(t.priority) || "—"} |`
    )
  }
  return lines.join("\n")
}

const AVAILABLE_ACTIONS = "```aspen-actions\nopen_sprint:Open Sprint\nreassign:Reassign Tasks\nstandup:Generate Standup\n```"

function wrap(opts: {
  summary: string
  items: string
  risks: { level: string; description: string }[]
  recommendations: { priority: string; action: string; impact: string }[]
}): string {
  const risks =
    opts.risks.length === 0
      ? "_None_"
      : ["| Level | Description |", "| --- | --- |"]
          .concat(opts.risks.map((r) => `| ${r.level} | ${r.description} |`))
          .join("\n")
  const recs =
    opts.recommendations.length === 0
      ? "_None_"
      : ["| Priority | Action | Expected Impact |", "| --- | --- | --- |"]
          .concat(opts.recommendations.map((r) => `| ${r.priority} | ${r.action} | ${r.impact} |`))
          .join("\n")

  return [
    "**Summary**",
    opts.summary,
    "",
    "**Relevant Items**",
    "",
    opts.items,
    "",
    "**Risks**",
    "",
    risks,
    "",
    "**Recommended Actions**",
    "",
    recs,
    "",
    "**Available Actions**",
    AVAILABLE_ACTIONS,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Handlers — each returns a fully formatted Aspen response (no LLM)
// ---------------------------------------------------------------------------

type Handler = (ctx: UserContext, req: FpReq) => Promise<string>

const FAST_HANDLERS: Record<FastKind, Handler> = {
  async my_tasks(ctx, req) {
    const supabase = await createClient()
    const tasks = (await fpFetchTasks(supabase, req.workspaceId, { projectId: req.projectId, limit: 50 }))
      .filter((t) => t.assignee_ids.includes(ctx.user.id) && t.status !== "done")
    const overdue = tasks.filter((t) => !!t.due_date && t.due_date < todayISO())
    return wrap({
      summary: `You have **${tasks.length}** open task${tasks.length === 1 ? "" : "s"}${overdue.length ? `, **${overdue.length}** overdue` : ""}.`,
      items: taskTable(tasks, ctx),
      risks:
        overdue.length > 0
          ? overdue.slice(0, 5).map((t) => ({ level: "🟠 high", description: `"${t.title}" is overdue (${t.due_date}).` }))
          : [],
      recommendations:
        overdue.length > 0
          ? [{ priority: "high", action: "Clear or reschedule overdue tasks first", impact: "Stops slippage on dependent work" }]
          : [],
    })
  },

  async due_today(ctx, req) {
    const supabase = await createClient()
    const tasks = (await fpFetchTasks(supabase, req.workspaceId, { projectId: req.projectId, dueOn: todayISO() }))
      .filter((t) => t.status !== "done")
    const mine = tasks.filter((t) => t.assignee_ids.includes(ctx.user.id))
    return wrap({
      summary: `**${tasks.length}** task${tasks.length === 1 ? "" : "s"} due today${mine.length ? `, **${mine.length}** assigned to you` : ""}.`,
      items: taskTable(tasks, ctx),
      risks: [],
      recommendations:
        tasks.length > 0
          ? [{ priority: "high", action: "Work top-priority due items today", impact: "Protects the sprint commitment" }]
          : [],
    })
  },

  async overdue(ctx, req) {
    const supabase = await createClient()
    const tasks = (await fpFetchTasks(supabase, req.workspaceId, { projectId: req.projectId, dueBefore: todayISO() }))
      .filter((t) => t.status !== "done")
    const mine = tasks.filter((t) => t.assignee_ids.includes(ctx.user.id))
    return wrap({
      summary: `**${tasks.length}** overdue task${tasks.length === 1 ? "" : "s"}${mine.length ? `, **${mine.length}** assigned to you` : ""}.`,
      items: taskTable(tasks, ctx),
      risks: tasks.slice(0, 5).map((t) => ({ level: "🔴 critical", description: `"${t.title}" overdue since ${t.due_date}.` })),
      recommendations:
        tasks.length > 0
          ? [{ priority: "high", action: "Triage overdue items or renegotiate dates", impact: "Prevents cascading delays" }]
          : [],
    })
  },

  async blocked(_ctx, req) {
    const supabase = await createClient()
    const tasks = await fpBlocked(supabase, req.workspaceId, req.projectId)
    return wrap({
      summary: `**${tasks.length}** task${tasks.length === 1 ? "" : "s"} blocked by an unfinished dependency.`,
      items: taskTable(tasks, _ctx),
      risks: tasks.slice(0, 5).map((t) => ({ level: "🟠 high", description: `"${t.title}" is waiting on a predecessor.` })),
      recommendations:
        tasks.length > 0
          ? [{ priority: "high", action: "Unblock predecessors or reassign", impact: "Frees dependent work" }]
          : [],
    })
  },

  async project_status(ctx, req) {
    const supabase = await createClient()
    if (req.projectId) {
      const tasks = await fpFetchTasks(supabase, req.workspaceId, { projectId: req.projectId, limit: 200 })
      const total = tasks.length
      const done = tasks.filter((t) => t.status === "done").length
      const pct = total > 0 ? Math.round((done / total) * 100) : 0
      const overdue = tasks.filter((t) => !!t.due_date && t.due_date < todayISO() && t.status !== "done").length
      const name = tasks[0]?.project_name ?? "Project"
      return wrap({
        summary: `**${name}** — **${pct}%** complete (${done}/${total}), **${overdue}** overdue.`,
        items: taskTable(tasks, ctx, 15),
        risks: overdue > 0 ? [{ level: "🟠 high", description: `${overdue} overdue task(s) in this project.` }] : [],
        recommendations: [],
      })
    }
    const ids = await fpProjectIds(supabase, req.workspaceId)
    const { data } = await supabase
      .from("projects")
      .select("id, name, status, due_date")
      .in("id", ids)
      .order("created_at", { ascending: true })
    const rows = (data ?? []).map((p: { name: string; status: string | null; due_date: string | null }) =>
      `| ${p.name} | ${p.status ?? "—"} | ${p.due_date ?? "—"} |`
    )
    const items = ["| Project | Status | Due |", "| --- | --- | --- |"].concat(rows.length ? rows : ["| _No projects_ | | |"]).join("\n")
    return wrap({
      summary: `**${rows.length}** project(s) in this workspace.`,
      items,
      risks: [],
      recommendations: [],
    })
  },

  async workspace_health(ctx, req) {
    const supabase = await createClient()
    const tasks = await fpFetchTasks(supabase, req.workspaceId, { limit: 300 })
    const openByMember = new Map<string, number>()
    for (const t of tasks) {
      if (t.status === "done") continue
      for (const id of t.assignee_ids.length ? t.assignee_ids : ["__u"]) {
        openByMember.set(id, (openByMember.get(id) ?? 0) + 1)
      }
    }
    const rows = ctx.members
      .map((m) => `| ${m.fullName} | ${openByMember.get(m.id) ?? 0} |`)
    const items = ["| Member | Open |", "| --- | --- |"].concat(rows.length ? rows : ["| _No members_ | |"]).join("\n")
    const overdue = tasks.filter((t) => !!t.due_date && t.due_date < todayISO() && t.status !== "done").length
    return wrap({
      summary: `Workspace has **${tasks.filter((t) => t.status !== "done").length}** open tasks${overdue ? `, **${overdue}** overdue` : ""}.`,
      items,
      risks: overdue > 0 ? [{ level: "🟠 high", description: `${overdue} overdue task(s) across the workspace.` }] : [],
      recommendations: [],
    })
  },

  async my_workload(ctx, req) {
    const supabase = await createClient()
    const tasks = (await fpFetchTasks(supabase, req.workspaceId, { projectId: req.projectId, limit: 100 }))
      .filter((t) => t.assignee_ids.includes(ctx.user.id))
    const open = tasks.filter((t) => t.status !== "done")
    const overdue = open.filter((t) => !!t.due_date && t.due_date < todayISO())
    return wrap({
      summary: `You have **${open.length}** open and **${overdue.length}** overdue.`,
      items: taskTable(open, ctx),
      risks:
        overdue.length > 3
          ? [{ level: "🔴 critical", description: `You are overloaded (${overdue.length} overdue).` }]
          : [],
      recommendations:
        overdue.length > 0
          ? [{ priority: "high", action: "Delegate or defer low-priority work", impact: "Restores sustainable load" }]
          : [],
    })
  },

  async recent_activity(_ctx, req) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("audit_log")
      .select("action, entity_type, created_at")
      .eq("workspace_id", req.workspaceId)
      .order("created_at", { ascending: false })
      .limit(12)
    const rows = (data ?? []).map((a: { action: string; entity_type: string | null; created_at: string }) =>
      `- ${a.created_at?.slice(0, 10)} · ${a.action} ${a.entity_type ?? ""}`
    )
    const items = ["**Recent activity**", "", rows.length ? rows.join("\n") : "_No recent activity_"].join("\n")
    return wrap({
      summary: rows.length ? `${rows.length} recent events in this workspace.` : "No recent activity.",
      items,
      risks: [],
      recommendations: [],
    })
  },

  async calendar_today(ctx, req) {
    return FAST_HANDLERS.due_today(ctx, req)
  },
}

export async function executeFastPath(
  kind: FastKind,
  ctx: UserContext,
  req: FpReq
): Promise<string> {
  const handler = FAST_HANDLERS[kind]
  if (!handler) throw new Error(`No fast-path handler for ${kind}`)
  return handler(ctx, req)
}
