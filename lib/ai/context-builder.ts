import { createClient } from "@/lib/supabase/server"

import { memberEmailById } from "@/lib/ai/user-context"
import { sortTasksByPriority, contextLevelFor } from "@/lib/ai/priority"
import {
  loadProfileSection,
  loadPreferenceSection,
  loadLongTermMemorySection,
} from "@/lib/ai/personal-memory"
import { searchSimilar } from "@/lib/ai/embeddings"
import {
  buildWorkspaceGraph,
  graphBlockedTasks,
  graphDueTodayTasks,
  graphOverdueTasks,
  graphOverloadedMembers,
  graphStaleTasks,
  graphTasksForUser,
  graphUpcomingTasks,
  type WorkspaceGraph,
  type GraphTask,
} from "@/lib/ai/graph"
import { detectInsights } from "@/lib/ai/predictive"
import { parseTemporal, temporalToDateFilter } from "@/lib/ai/temporal"
import type {
  ContextLevel,
  ContextPackage,
  ContextSection,
  IntentResult,
  PredictiveInsight,
  UserContext,
} from "@/lib/ai/types"

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
}

type TaskRow = {
  id: string
  title: string
  status: string
  due_date: string | null
  priority: string | null
  project_id: string
  project_name: string
  assignee_ids: string[]
  isMine: boolean
  blocked?: boolean
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0]
}

function projectNameOf(raw: RawTask): string {
  const p = raw.projects
  if (Array.isArray(p)) return p[0]?.name ?? "Unknown"
  return p?.name ?? "Unknown"
}

function toTaskRow(raw: RawTask, userId: string): TaskRow {
  const assignees = (raw.task_assignees ?? []).map((a) => a.user_id)
  if (raw.assignee_id && !assignees.includes(raw.assignee_id)) {
    assignees.push(raw.assignee_id)
  }
  return {
    id: raw.id,
    title: raw.title,
    status: raw.status,
    due_date: raw.due_date,
    priority: raw.priority,
    project_id: raw.project_id,
    project_name: projectNameOf(raw),
    assignee_ids: assignees,
    isMine: assignees.includes(userId),
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case "done": return "✅ done"
    case "in_progress": return "🟡 in progress"
    case "todo": return "⬜ todo"
    case "backlog": return "📦 backlog"
    default: return status
  }
}

function priorityBadge(priority: string | null): string {
  if (!priority) return ""
  switch (priority) {
    case "urgent": return "🔴 urgent"
    case "high": return "🟠 high"
    case "medium": return "🟡 medium"
    case "low": return "⚪ low"
    default: return priority
  }
}

function renderTaskTable(tasks: TaskRow[], ctx: UserContext): string {
  if (tasks.length === 0) return "_None_"
  // Context Priority Engine: surface highest-value tasks first.
  const sorted = sortTasksByPriority(tasks)
  const lines = [
    "| Task | Project | Owner | Status | Due | Priority |",
    "| --- | --- | --- | --- | --- | --- |",
  ]
  for (const t of sorted.slice(0, 25)) {
    const owners = t.assignee_ids
      .map((id) => memberEmailById(ctx, id) ?? "unassigned")
      .join(", ")
    const due = t.due_date ?? "—"
    lines.push(
      `| ${t.title} | ${t.project_name} | ${owners || "unassigned"} | ${statusBadge(t.status)} | ${due} | ${priorityBadge(t.priority) || "—"} |`
    )
  }
  return lines.join("\n")
}

function renderGraphTaskTable(tasks: GraphTask[], ctx: UserContext, limit = 25): string {
  if (tasks.length === 0) return "_None_"
  const sorted = sortTasksByPriority(tasks)
  const lines = [
    "| Task | Project | Owner | Status | Due | Priority |",
    "| --- | --- | --- | --- | --- | --- |",
  ]
  for (const t of sorted.slice(0, limit)) {
    const owners = t.assignee_ids
      .map((id) => memberEmailById(ctx, id) ?? "unassigned")
      .join(", ")
    const due = t.due_date ?? "—"
    lines.push(
      `| ${t.title} | ${t.project_name} | ${owners || "unassigned"} | ${statusBadge(t.status)} | ${due} | ${priorityBadge(t.priority) || "—"} |`
    )
  }
  return lines.join("\n")
}

function renderWorkloadFromGraph(g: WorkspaceGraph): string {
  const rows = graphOverloadedMembers(g)
  const lines = ["| Member | Open | Overdue |", "| --- | --- | --- |"]
  for (const m of g.members) {
    const assigned = g.tasks.filter((t) => t.assignee_ids.includes(m.id))
    const open = assigned.filter((t) => t.status !== "done").length
    const overdue = assigned.filter(
      (t) => !!t.due_date && t.due_date < todayISO() && t.status !== "done"
    ).length
    lines.push(`| ${m.fullName} | ${open} | ${overdue} |`)
  }
  return lines.join("\n")
}

type TaskQuery = {
  workspaceId: string
  projectId?: string | null
  status?: string
  dueOn?: string
  dueBefore?: string
  dueAfter?: string
  limit?: number
}

async function fetchTasks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  q: TaskQuery
): Promise<TaskRow[]> {
  let query = supabase
    .from("tasks")
    .select(
      "id, title, status, due_date, priority, assignee_id, project_id, projects(name), task_assignees(user_id)"
    )
    .is("archived_at", null)

  if (q.projectId) {
    query = query.eq("project_id", q.projectId)
  } else {
    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .eq("workspace_id", q.workspaceId)
      .is("archived_at", null)
    const ids = (projects ?? []).map((p) => p.id)
    if (ids.length === 0) return []
    query = query.in("project_id", ids)
  }

  if (q.status) query = query.eq("status", q.status)
  if (q.dueOn) query = query.eq("due_date", q.dueOn)
  if (q.dueBefore) query = query.lt("due_date", q.dueBefore)
  if (q.dueAfter) query = query.gt("due_date", q.dueAfter)

  query = query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(q.limit ?? 30)

  const { data } = await query
  const raw = (data ?? []) as RawTask[]
  return raw.map((r) => toTaskRow(r, userId))
}

async function fetchWorkload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: UserContext,
  projectId?: string | null
): Promise<string> {
  const projectIds = projectId
    ? [projectId]
    : ctx.projects.map((p) => p.id)
  if (projectIds.length === 0) return "_No projects_"

  const { data } = await supabase
    .from("tasks")
    .select("assignee_id, task_assignees(user_id), status")
    .in("project_id", projectIds)
    .is("archived_at", null)

  const rows = (data ?? []) as RawTask[]
  const byMember = new Map<string, { open: number; done: number }>()
  for (const m of ctx.members) byMember.set(m.id, { open: 0, done: 0 })

  for (const r of rows) {
    const ids = (r.task_assignees ?? []).map((a) => a.user_id)
    if (r.assignee_id && !ids.includes(r.assignee_id)) ids.push(r.assignee_id)
    const isDone = r.status === "done"
    for (const id of ids.length ? ids : ["__unassigned"]) {
      const bucket = byMember.get(id) ?? byMember.get("__unassigned") ?? { open: 0, done: 0 }
      if (isDone) bucket.done += 1
      else bucket.open += 1
      byMember.set(id, bucket)
    }
  }

  const lines = [
    "| Member | Open | Done | Total |",
    "| --- | --- | --- | --- |",
  ]
  for (const m of ctx.members) {
    const b = byMember.get(m.id) ?? { open: 0, done: 0 }
    lines.push(`| ${m.fullName} | ${b.open} | ${b.done} | ${b.open + b.done} |`)
  }
  const un = byMember.get("__unassigned")
  if (un && un.open + un.done > 0) {
    lines.push(`| Unassigned | ${un.open} | ${un.done} | ${un.open + un.done} |`)
  }
  return lines.join("\n")
}

async function fetchBlocked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: UserContext,
  projectId?: string | null
): Promise<TaskRow[]> {
  const tasks = await fetchTasks(supabase, ctx.user.id, {
    workspaceId: ctx.workspace.id,
    projectId,
    limit: 200,
  })
  if (tasks.length === 0) return []

  const taskIds = tasks.map((t) => t.id)
  const { data: deps } = await supabase
    .from("task_dependencies")
    .select("dependent_task_id, dependency_task_id")
    .in("dependent_task_id", taskIds)

  if (!deps || deps.length === 0) return []
  const depTaskIds = Array.from(new Set(deps.map((d) => d.dependency_task_id)))
  const { data: depTasks } = await supabase
    .from("tasks")
    .select("id, status")
    .in("id", depTaskIds)

  const doneSet = new Set(
    (depTasks ?? []).filter((t) => t.status === "done").map((t) => t.id)
  )

  const blockedIds = new Set(
    deps
      .filter((d) => !doneSet.has(d.dependency_task_id))
      .map((d) => d.dependent_task_id)
  )

  return tasks.filter((t) => blockedIds.has(t.id) && t.status !== "done")
}

async function fetchRecentActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  limit = 12
): Promise<string> {
  try {
    const { data } = await supabase
      .from("audit_log")
      .select("action, entity_type, created_at, actor_id")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (!data || data.length === 0) return "_No recent activity_"
    return data
      .map((a) => `- ${a.created_at?.slice(0, 10)} · ${a.action} ${a.entity_type ?? ""}`)
      .join("\n")
  } catch {
    return "_Activity log unavailable_"
  }
}

async function fetchProjectDetail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: UserContext,
  projectId: string
): Promise<string> {
  const tasks = await fetchTasks(supabase, ctx.user.id, {
    workspaceId: ctx.workspace.id,
    projectId,
    limit: 200,
  })
  const total = tasks.length
  const done = tasks.filter((t) => t.status === "done").length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const overdue = tasks.filter(
    (t) => t.due_date && t.due_date < todayISO() && t.status !== "done"
  )
  const inProgress = tasks.filter((t) => t.status === "in_progress")
  const urgent = tasks.filter((t) => t.priority === "urgent" && t.status !== "done")

  const lines = [
    `**${ctx.project?.name ?? "Project"}** — ${pct}% complete (${done}/${total})`,
  ]
  if (ctx.project?.status) lines.push(`Status: ${ctx.project.status}`)
  if (ctx.project?.dueDate) lines.push(`Due: ${ctx.project.dueDate}`)
  lines.push("")
  lines.push("| Metric | Value |")
  lines.push("| --- | --- |")
  lines.push(`| Total tasks | ${total} |`)
  lines.push(`| ✅ Done | ${done} |`)
  lines.push(`| 🟡 In progress | ${inProgress.length} |`)
  lines.push(`| ⚠️ Overdue | ${overdue.length} |`)
  lines.push(`| 🔴 Urgent | ${urgent.length} |`)
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Intent → context package dispatch
// ---------------------------------------------------------------------------

/**
 * The Smart Context Builder. Given the classified intent and the resolved
 * user context, it fetches ONLY the data the intent needs — never the whole
 * database — and returns a compact, scannable context package the LLM reasons
 * over. Permission scoping is applied here (e.g. "my" queries filter to the
 * current user; analytics respect the viewer's role).
 */
export async function buildContextPackage(
  intent: IntentResult,
  ctx: UserContext,
  message?: string
): Promise<ContextPackage> {
  const supabase = await createClient()
  const userId = ctx.user.id
  const sections: ContextSection[] = []
  const missing: string[] = []
  const e = intent.entities

  // Selected-object context ("this", "it", "that", "the selected").
  // Resolved before any intent-specific data so the model always knows
  // what "this" refers to, regardless of how the question was classified.
  if (intent.entities.selectedRef && ctx.selected) {
    const sel = await buildSelectedSection(supabase, ctx)
    if (sel) sections.push(sel)
  }

  // Effective scope: a named project overrides the currently open one.
  const projectId = e.projectId ?? ctx.project?.id ?? null

  // Heavy intents traverse the Relationship Graph once and derive predictive
  // insights from it. Light intents stay on narrow, isolated queries.
  const HEAVY = new Set(["risk_analysis", "workspace_analytics", "status_report", "planning", "sprint_query"])
  let graph: WorkspaceGraph | null = null
  let insights: PredictiveInsight[] = []
  if (HEAVY.has(intent.intent)) {
    graph = await buildWorkspaceGraph(supabase, ctx, { projectId })
    insights = detectInsights(graph, ctx)
  }

  const addMembers = () => {
    if (sections.some((s) => s.title === "Team")) return
    const lines = ctx.members
      .map((m) => `- ${m.fullName} <${m.email}> · ${m.role}`)
      .join("\n")
    sections.push({ title: "Team", content: lines })
  }

  switch (intent.intent) {
    case "task_query": {
      if (e.scopeMe) {
        const mine = (await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          status: e.status ?? undefined,
          limit: 40,
        })).filter((t) => t.isMine)
        sections.push({
          title: "Your tasks",
          content: renderTaskTable(mine, ctx),
        })
      } else if (e.dateToken === "overdue") {
        const overdue = (await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          projectId,
          dueBefore: todayISO(),
          limit: 40,
        })).filter((t) => t.status !== "done")
        sections.push({
          title: "Overdue tasks",
          content: renderTaskTable(overdue, ctx),
        })
      } else if (e.dateToken) {
        const filters = e.temporal ? temporalToDateFilter(e.temporal) : {}
        const due = await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          projectId,
          ...filters,
          limit: 40,
        })
        sections.push({
          title: e.dateToken === "today" ? "Tasks due today" : `Tasks due ${e.temporal?.label ?? e.dateToken}`,
          content: renderTaskTable(due, ctx),
        })
      } else if (projectId) {
        const projectTasks = await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          projectId,
          limit: 50,
        })
        sections.push({
          title: `Tasks in ${ctx.projects.find((p) => p.id === projectId)?.name ?? "project"}`,
          content: renderTaskTable(projectTasks, ctx),
        })
      } else {
        const open = await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          status: e.status ?? undefined,
          limit: 40,
        })
        sections.push({
          title: "Open tasks (workspace)",
          content: renderTaskTable(open, ctx),
        })
      }
      break
    }

    case "planning": {
      if (graph) {
        const mine = graphTasksForUser(graph, userId)
        const dueSoon = sortTasksByPriority(
          graphUpcomingTasks(graph, 7).filter((t) => t.assignee_ids.includes(userId))
        )
        sections.push({
          title: "Your open work (next 7 days, priority-ordered)",
          content: renderGraphTaskTable(dueSoon.length ? dueSoon : mine, ctx),
        })
        sections.push({ title: "Team workload", content: renderWorkloadFromGraph(graph) })
      } else {
        const mine = (await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          limit: 40,
        })).filter((t) => t.isMine && t.status !== "done")
        const dueSoon = mine
          .filter((t) => t.due_date && t.due_date <= addDays(todayISO(), 7))
          .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
        sections.push({
          title: "Your open work (next 7 days prioritized)",
          content: renderTaskTable(dueSoon, ctx),
        })
        const workload = await fetchWorkload(supabase, ctx, projectId)
        sections.push({ title: "Team workload", content: workload })
      }
      break
    }

    case "risk_analysis": {
      if (graph) {
        const mine = graphTasksForUser(graph, userId)
        const myOverdue = graphOverdueTasks(graph).filter((t) => t.assignee_ids.includes(userId))
        const myUrgent = mine.filter((t) => t.priority === "urgent")
        sections.push({
          title: "Your workload",
          content:
            `Open: **${mine.length}** · Overdue: **${myOverdue.length}** · Urgent: **${myUrgent.length}**\n\n` +
            renderGraphTaskTable(sortTasksByPriority(myOverdue.concat(myUrgent)), ctx),
        })
        const blocked = graphBlockedTasks(graph)
        sections.push({
          title: "Blocked tasks",
          content: blocked.length ? renderGraphTaskTable(blocked, ctx) : "_None detected_",
        })
        sections.push({ title: "Team capacity", content: renderWorkloadFromGraph(graph) })
      } else {
        const mine = (await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          limit: 100,
        })).filter((t) => t.isMine)
        const myOpen = mine.filter((t) => t.status !== "done")
        const myOverdue = myOpen.filter((t) => t.due_date && t.due_date < todayISO())
        const myUrgent = myOpen.filter((t) => t.priority === "urgent")
        sections.push({
          title: "Your workload",
          content:
            `Open: **${myOpen.length}** · Overdue: **${myOverdue.length}** · Urgent: **${myUrgent.length}**\n\n` +
            renderTaskTable(myOverdue.concat(myUrgent), ctx),
        })
        const blocked = await fetchBlocked(supabase, ctx, projectId)
        sections.push({
          title: "Blocked tasks",
          content: blocked.length ? renderTaskTable(blocked, ctx) : "_None detected_",
        })
        const workload = await fetchWorkload(supabase, ctx, projectId)
        sections.push({ title: "Team capacity", content: workload })
      }
      break
    }

    case "calendar_query": {
      if (e.dateToken === "overdue") {
        const overdue = (await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          projectId,
          dueBefore: todayISO(),
          limit: 40,
        })).filter((t) => t.status !== "done")
        sections.push({ title: "Overdue", content: renderTaskTable(overdue, ctx) })
      } else if (e.scopeMe || !projectId) {
        const filters = e.temporal ? temporalToDateFilter(e.temporal) : { dueOn: todayISO() }
        const due = await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          ...filters,
          limit: 40,
        })
        const scoped = e.scopeMe ? due.filter((t) => t.isMine) : due
        sections.push({
          title: e.dateToken === "today" || !e.dateToken ? "Due today" : `Due ${e.temporal?.label ?? e.dateToken}`,
          content: renderTaskTable(scoped, ctx),
        })
      } else {
        const filters = e.temporal ? temporalToDateFilter(e.temporal) : { dueOn: todayISO() }
        const due = await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          projectId,
          ...filters,
          limit: 40,
        })
        sections.push({
          title: e.dateToken === "today" || !e.dateToken ? "Due today" : `Due ${e.temporal?.label ?? e.dateToken}`,
          content: renderTaskTable(due, ctx),
        })
      }
      break
    }

    case "project_query": {
      if (projectId) {
        const detail = await fetchProjectDetail(supabase, ctx, projectId)
        sections.push({ title: "Project snapshot", content: detail })
        const tasks = await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          projectId,
          limit: 50,
        })
        sections.push({ title: "Tasks", content: renderTaskTable(tasks, ctx) })
      } else {
        const summary = await fetchWorkload(supabase, ctx)
        sections.push({ title: "Projects & workload", content: summary })
        missing.push("which project — please name one if you want detail")
      }
      break
    }

    case "sprint_query": {
      // Aspen models delivery as project work sets (no dedicated sprint
      // table yet). Surface the active project's open work + upcoming dates.
      const pid = projectId ?? ctx.project?.id
      if (graph && pid) {
        const detail = await fetchProjectDetail(supabase, ctx, pid)
        sections.push({ title: "Current iteration (project focus)", content: detail })
        const open = graph.tasks
          .filter((t) => t.project_id === pid && t.status !== "done")
        sections.push({ title: "Open work this iteration", content: renderGraphTaskTable(open, ctx) })
      } else if (pid) {
        const detail = await fetchProjectDetail(supabase, ctx, pid)
        sections.push({ title: "Current iteration (project focus)", content: detail })
        const open = (await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          projectId: pid,
          limit: 50,
        })).filter((t) => t.status !== "done")
        sections.push({ title: "Open work this iteration", content: renderTaskTable(open, ctx) })
      } else {
        const content = graph
          ? renderGraphTaskTable(graph.tasks.filter((t) => t.status !== "done"), ctx)
          : renderTaskTable(
              (await fetchTasks(supabase, userId, { workspaceId: ctx.workspace.id, limit: 50 })).filter(
                (t) => t.status !== "done"
              ),
              ctx
            )
        sections.push({
          title: "Open work across workspace",
          content,
        })
        missing.push("which project/sprint you mean")
      }
      break
    }

    case "workspace_analytics": {
      if (graph) {
        sections.push({ title: "Workspace workload by member", content: renderWorkloadFromGraph(graph) })
        const overdue = graphOverdueTasks(graph)
        sections.push({ title: "Overdue (workspace)", content: renderGraphTaskTable(overdue, ctx) })
        if (ctx.permissions.includes("view_analytics") && graph.recentActivity.length) {
          sections.push({
            title: "Recent activity",
            content: graph.recentActivity
              .map((a) => `- ${a.date} · ${a.action} ${a.entity}`)
              .join("\n"),
          })
        } else if (!ctx.permissions.includes("view_analytics")) {
          missing.push("analytics permission (members see task-level data only)")
        }
      } else {
        const summary = await fetchWorkload(supabase, ctx)
        sections.push({ title: "Workspace workload by member", content: summary })
        const overdue = (await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          dueBefore: todayISO(),
          limit: 40,
        })).filter((t) => t.status !== "done")
        sections.push({ title: "Overdue (workspace)", content: renderTaskTable(overdue, ctx) })
        if (ctx.permissions.includes("view_analytics")) {
          const activity = await fetchRecentActivity(supabase, ctx.workspace.id)
          sections.push({ title: "Recent activity", content: activity })
        } else {
          missing.push("analytics permission (members see task-level data only)")
        }
      }
      break
    }

    case "status_report": {
      if (graph) {
        sections.push({ title: "Workspace status", content: renderWorkloadFromGraph(graph) })
        if (projectId) {
          const detail = await fetchProjectDetail(supabase, ctx, projectId)
          sections.push({ title: "Project snapshot", content: detail })
        }
        sections.push({
          title: "Recent activity",
          content: graph.recentActivity.length
            ? graph.recentActivity.map((a) => `- ${a.date} · ${a.action} ${a.entity}`).join("\n")
            : "_No recent activity_",
        })
      } else {
        const summary = await fetchWorkload(supabase, ctx)
        sections.push({ title: "Workspace status", content: summary })
        if (projectId) {
          const detail = await fetchProjectDetail(supabase, ctx, projectId)
          sections.push({ title: "Project snapshot", content: detail })
        }
        const activity = await fetchRecentActivity(supabase, ctx.workspace.id)
        sections.push({ title: "Recent activity", content: activity })
      }
      break
    }

    case "member_query": {
      addMembers()
      if (e.memberId && e.memberId !== userId) {
        const theirTasks = (await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          limit: 50,
        })).filter((t) => t.assignee_ids.includes(e.memberId!))
        sections.push({
          title: `${e.memberName ?? "Member"} — assigned work`,
          content: renderTaskTable(theirTasks, ctx),
        })
      }
      break
    }

    case "action_request": {
      addMembers()
      if (projectId) {
        const tasks = await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          projectId,
          limit: 50,
        })
        sections.push({
          title: "Tasks available to act on",
          content: renderTaskTable(tasks, ctx),
        })
      } else if (e.scopeMe) {
        const mine = (await fetchTasks(supabase, userId, {
          workspaceId: ctx.workspace.id,
          limit: 50,
        })).filter((t) => t.isMine)
        sections.push({ title: "Your tasks", content: renderTaskTable(mine, ctx) })
      } else {
        addMembers()
      }
      break
    }

    case "search": {
      // Light context: project list + team, so the model can resolve names
      // and lean on its tools (search_tasks, search_drive, …) for the rest.
      sections.push({
        title: "Projects",
        content: ctx.projects.map((p) => `- ${p.name}`).join("\n") || "_None_",
      })
      addMembers()
      break
    }

    case "general_chat":
    default: {
      // Minimal context — just enough to be a good teammate.
      if (projectId && ctx.project) {
        const detail = await fetchProjectDetail(supabase, ctx, projectId)
        sections.push({ title: "Current project", content: detail })
      }
      break
    }
  }

  // Personal Memory sections — injected only for LLM-bound intents.
  // Profile is lightweight (one row) and always loaded.
  const level = contextLevelFor(intent, ctx)
  const profile = await loadProfileSection(ctx.user.id, ctx.workspace.id)
  if (profile) sections.push({ title: "User profile", content: profile })
  if (level !== "L0" && level !== "L1") {
    const prefs = await loadPreferenceSection(ctx.user.id, ctx.workspace.id)
    if (prefs) sections.push({ title: "User preferences", content: prefs })
    const memories = await loadLongTermMemorySection(ctx.user.id, ctx.workspace.id)
    if (memories) sections.push({ title: "Personal memories", content: memories })
  }

  // Semantic knowledge — hybrid (SQL + vector) retrieval for reasoning intents.
  if (level !== "L0" && level !== "L1" && message && message.trim().length > 0) {
    try {
      const knowledge = await searchSimilar({
        workspaceId: ctx.workspace.id,
        query: message,
        projectId: projectId ?? undefined,
        topK: 6,
        minSimilarity: 0.5,
      })
      if (knowledge.length > 0) {
        const lines = knowledge.map(
          (k) =>
            `- (${k.similarity.toFixed(2)}) **${k.sourceType}** — ` +
            k.content.slice(0, 200).replace(/\n/g, " ") +
            (k.content.length > 200 ? "…" : "") +
            ` [source: ${k.sourceType}#${k.sourceId.slice(0, 8)}]`
        )
        sections.push({
          title: "Relevant knowledge",
          content: lines.join("\n"),
        })
      }
    } catch {
      // Embedding API may be unavailable; silently skip.
    }
  }

  const scope = describeScope(intent, ctx, projectId)
  return {
    scope,
    level: contextLevelFor(intent, ctx),
    sections,
    insights,
    limited: !ctx.permissions.includes("view_analytics") &&
      (intent.intent === "workspace_analytics"),
    missing,
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

function describeScope(
  intent: IntentResult,
  ctx: UserContext,
  projectId: string | null
): string {
  const who = intent.entities.scopeMe ? `you (${ctx.user.fullName})` : "the workspace"
  const where = projectId
    ? ctx.projects.find((p) => p.id === projectId)?.name ?? "the open project"
    : ctx.workspace.name
  return `${intent.intent} · scope: ${who} · context: ${where}` +
    (ctx.page ? ` · page: ${ctx.page}` : "")
}

/**
 * Builds a context section for the selected object (task / note / meeting /
 * member / sprint) that "this" / "it" / "that" resolves to.
 */
async function buildSelectedSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: UserContext
): Promise<ContextSection | null> {
  if (!ctx.selected) return null
  const s = ctx.selected

  switch (s.kind) {
    case "task": {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, description, status, due_date, priority, project_id, projects(name)")
        .eq("id", s.id)
        .maybeSingle()
      if (!data) return { title: "Selected task (not found)", content: `_"${s.title}" not accessible._` }
      return {
        title: "Selected task",
        content: [
          `- **Title:** ${data.title}`,
          `- **Status:** ${data.status}`,
          `- **Due:** ${data.due_date ?? "—"}`,
          `- **Priority:** ${data.priority ?? "—"}`,
          data.description ? `- **Description:** ${data.description}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      }
    }
    case "note": {
      const { data } = await supabase
        .from("notes")
        .select("id, title, body, type")
        .eq("id", s.id)
        .maybeSingle()
      if (!data) return { title: "Selected note (not found)", content: `_"${s.title}" not accessible._` }
      return {
        title: "Selected note",
        content: [
          `- **Title:** ${data.title}`,
          `- **Type:** ${data.type}`,
          data.body ? `- **Content:** ${data.body.slice(0, 1000)}` + (data.body.length > 1000 ? "…" : "") : null,
        ]
          .filter(Boolean)
          .join("\n"),
      }
    }
    case "meeting": {
      const { data } = await supabase
        .from("meetings")
        .select("id, title, start_time, description")
        .eq("id", s.id)
        .maybeSingle()
      if (!data) return { title: "Selected meeting (not found)", content: `_"${s.title}" not accessible._` }
      return {
        title: "Selected meeting",
        content: [
          `- **Title:** ${data.title}`,
          `- **Time:** ${data.start_time}`,
          data.description ? `- **Description:** ${data.description}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      }
    }
    case "member": {
      const m = ctx.members.find((x) => x.id === s.id)
      if (!m) return null
      return {
        title: "Selected team member",
        content: `- **Name:** ${m.fullName}\n- **Role:** ${m.role}\n- **Email:** ${m.email}`,
      }
    }
    case "sprint": {
      const { data } = await supabase
        .from("projects")
        .select("id, name, status, due_date, description")
        .eq("id", s.id)
        .maybeSingle()
      if (!data) return { title: "Selected sprint (not found)", content: `_"${s.title}" not accessible._` }
      return {
        title: "Selected sprint",
        content: [
          `- **Name:** ${data.name}`,
          `- **Status:** ${data.status ?? "—"}`,
          `- **Due:** ${data.due_date ?? "—"}`,
          data.description ? `- **Description:** ${data.description}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      }
    }
  }
}
