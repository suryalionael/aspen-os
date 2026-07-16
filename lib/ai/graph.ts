import { createClient } from "@/lib/supabase/server"
import { memberEmailById } from "@/lib/ai/user-context"
import type { UserContext } from "@/lib/ai/types"

// ---------------------------------------------------------------
// Typed graph nodes
// ---------------------------------------------------------------
export type GraphTask = {
  id: string
  title: string
  status: string
  due_date: string | null
  priority: string | null
  assignee_ids: string[]
  project_id: string
  project_name: string
  created_at: string
  updated_at: string
  labels: { name: string; color: string }[]
  commentCount: number
  attachmentCount: number
  isMine: boolean
  blocked: boolean
}

export type GraphMember = {
  id: string
  email: string
  fullName: string
}

export type GraphProject = {
  id: string
  name: string
  status: string | null
  due_date: string | null
}

export type GraphMeeting = {
  id: string
  title: string
  start_time: string
  project_id: string | null
  attendee_ids: string[]
}

export type WorkspaceGraph = {
  workspaceId: string
  members: GraphMember[]
  projects: GraphProject[]
  tasks: GraphTask[]
  meetings: GraphMeeting[]
  notifications: { unreadCount: number; latest: { type: string; message: string }[] }
  recentActivity: { action: string; entity: string; date: string }[]
}

// ---------------------------------------------------------------
// Query helpers that traverse the graph rather than re-querying DB
// ---------------------------------------------------------------

export function graphTasksForUser(g: WorkspaceGraph, userId: string): GraphTask[] {
  return g.tasks.filter((t) => t.assignee_ids.includes(userId) && t.status !== "done")
}

export function graphBlockedTasks(g: WorkspaceGraph): GraphTask[] {
  return g.tasks.filter((t) => t.blocked && t.status !== "done")
}

export function graphOverdueTasks(g: WorkspaceGraph): GraphTask[] {
  const today = new Date().toISOString().split("T")[0]
  return g.tasks.filter((t) => !!t.due_date && t.due_date < today && t.status !== "done")
}

export function graphDueTodayTasks(g: WorkspaceGraph): GraphTask[] {
  const today = new Date().toISOString().split("T")[0]
  return g.tasks.filter((t) => t.due_date === today && t.status !== "done")
}

export function graphUpcomingTasks(g: WorkspaceGraph, days = 7): GraphTask[] {
  const today = new Date().toISOString().split("T")[0]
  const end = addDays(today, days)
  return g.tasks.filter(
    (t) => !!t.due_date && t.due_date >= today && t.due_date <= end && t.status !== "done"
  )
}

export function graphOverloadedMembers(g: WorkspaceGraph): { member: GraphMember; open: number; overdue: number }[] {
  const today = new Date().toISOString().split("T")[0]
  return g.members
    .map((m) => {
      const assigned = g.tasks.filter((t) => t.assignee_ids.includes(m.id))
      return {
        member: m,
        open: assigned.filter((t) => t.status !== "done").length,
        overdue: assigned.filter((t) => !!t.due_date && t.due_date < today && t.status !== "done").length,
      }
    })
    .filter((m) => m.open > 5 || m.overdue > 2)
    .sort((a, b) => b.open - a.open)
}

export function graphStaleTasks(g: WorkspaceGraph, staleDays = 14): GraphTask[] {
  const cutoff = new Date(Date.now() - staleDays * 86_400_000).toISOString()
  return g.tasks.filter(
    (t) => t.status !== "done" && t.updated_at < cutoff
  )
}

export function graphMissingAssignees(g: WorkspaceGraph): GraphTask[] {
  return g.tasks.filter((t) => t.assignee_ids.length === 0 && t.status !== "done")
}

// ---------------------------------------------------------------
// Graph builder — fetches connected context in one cohesive traversal
// ---------------------------------------------------------------

export async function buildWorkspaceGraph(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: UserContext,
  opts?: { projectId?: string | null; maxTasks?: number }
): Promise<WorkspaceGraph> {
  const maxTasks = opts?.maxTasks ?? 300
  const projectId = opts?.projectId ?? ctx.project?.id ?? null

  // Projects
  const projQuery = supabase
    .from("projects")
    .select("id, name, status, due_date")
    .eq("workspace_id", ctx.workspace.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
  const { data: projects } = projectId
    ? await supabase.from("projects").select("id, name, status, due_date").eq("id", projectId).maybeSingle().then((r) => ({ data: r.data ? [r.data] : [] }))
    : await projQuery
  const graphProjects: GraphProject[] = (projects ?? []).map((p: { id: string; name: string; status: string | null; due_date: string | null }) => ({
    id: p.id, name: p.name, status: p.status, due_date: p.due_date,
  }))
  const projectIds = graphProjects.map((p) => p.id)
  if (projectIds.length === 0) {
    return emptyGraph(ctx)
  }

  // Tasks with nested relations
  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      "id, title, status, due_date, priority, assignee_id, project_id, created_at, updated_at, " +
      "projects!inner(name), " +
      "task_assignees(user_id), " +
      "task_labels(labels(id, name, color)), " +
      "comments(count), " +
      "task_attachments(count)"
    )
    .in("project_id", projectIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(maxTasks)

  const taskIds = ((tasks ?? []) as unknown as { id: string }[]).map((t) => t.id)

  // Dependencies — which tasks block others
  const { data: deps } = await supabase
    .from("task_dependencies")
    .select("dependent_task_id, dependency_task_id")
    .in("dependent_task_id", taskIds)

  const depTaskIds = Array.from(new Set((deps ?? []).map((d: { dependency_task_id: string }) => d.dependency_task_id)))
  const { data: depStatuses } = await supabase
    .from("tasks")
    .select("id, status")
    .in("id", depTaskIds)
  const doneSet = new Set((depStatuses ?? []).filter((t: { status: string }) => t.status === "done").map((t: { id: string }) => t.id))
  const blockedSet = new Set(
    (deps ?? [])
      .filter((d: { dependency_task_id: string }) => !doneSet.has(d.dependency_task_id))
      .map((d: { dependent_task_id: string }) => d.dependent_task_id)
  )

  const members = ctx.members
  const graphTasks: GraphTask[] = ((tasks ?? []) as unknown as Array<Record<string, unknown>>).map((raw) => {
    const t = raw as {
      id: string; title: string; status: string; due_date: string | null; priority: string | null;
      assignee_id: string | null; project_id: string; created_at: string; updated_at: string;
      projects: { name: string } | { name: string }[];
      task_assignees: { user_id: string }[];
      task_labels: { labels: { id: string; name: string; color: string } | { id: string; name: string; color: string }[] }[];
      comments: { count: number }[];
      task_attachments: { count: number }[];
    }
    const assigneeIds = (t.task_assignees ?? []).map((a: { user_id: string }) => a.user_id)
    if (t.assignee_id && !assigneeIds.includes(t.assignee_id)) assigneeIds.push(t.assignee_id)
    const projName = Array.isArray(t.projects) ? t.projects[0]?.name : (t.projects as { name: string })?.name ?? "Unknown"
    const labels = t.task_labels?.flatMap((row: { labels: { id: string; name: string; color: string } | { id: string; name: string; color: string }[] }) =>
      Array.isArray(row.labels) ? row.labels : row.labels ? [row.labels] : []
    ) ?? []
    return {
      id: t.id, title: t.title, status: t.status, due_date: t.due_date, priority: t.priority,
      assignee_ids: assigneeIds, project_id: t.project_id, project_name: projName,
      created_at: t.created_at, updated_at: t.updated_at,
      labels, commentCount: (t.comments?.[0] as { count: number } | undefined)?.count ?? 0,
      attachmentCount: (t.task_attachments?.[0] as { count: number } | undefined)?.count ?? 0,
      isMine: assigneeIds.includes(ctx.user.id), blocked: blockedSet.has(t.id),
    }
  })

  // Upcoming meetings
  const now = new Date().toISOString()
  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, title, start_time, project_id, meeting_attendees(user_id)")
    .eq("workspace_id", ctx.workspace.id)
    .gte("start_time", now)
    .order("start_time", { ascending: true })
    .limit(15)

  const graphMeetings: GraphMeeting[] = (meetings ?? []).map((m: { id: string; title: string; start_time: string; project_id: string | null; meeting_attendees: { user_id: string }[] }) => ({
    id: m.id, title: m.title, start_time: m.start_time, project_id: m.project_id,
    attendee_ids: (m.meeting_attendees ?? []).map((a: { user_id: string }) => a.user_id),
  }))

  // Notifications (current user's unread count + latest few)
  const { data: notifs } = await supabase
    .from("notifications")
    .select("type, message, created_at")
    .eq("workspace_id", ctx.workspace.id)
    .eq("user_id", ctx.user.id)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(5)

  const notifications = {
    unreadCount: (notifs ?? []).length,
    latest: (notifs ?? []).map((n: { type: string; message: string; created_at: string }) => ({ type: n.type, message: n.message })),
  }

  // Recent activity (audit_log)
  const { data: activity } = await supabase
    .from("audit_log")
    .select("action, entity_type, created_at")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false })
    .limit(15)

  const recentActivity = (activity ?? []).map((a: { action: string; entity_type: string; created_at: string }) => ({
    action: a.action, entity: a.entity_type ?? "", date: a.created_at?.slice(0, 10),
  }))

  return {
    workspaceId: ctx.workspace.id,
    members: members.map((m) => ({ id: m.id, email: m.email, fullName: m.fullName })),
    projects: graphProjects,
    tasks: graphTasks,
    meetings: graphMeetings,
    notifications,
    recentActivity,
  }
}

function emptyGraph(ctx: UserContext): WorkspaceGraph {
  return {
    workspaceId: ctx.workspace.id,
    members: ctx.members.map((m) => ({ id: m.id, email: m.email, fullName: m.fullName })),
    projects: [],
    tasks: [],
    meetings: [],
    notifications: { unreadCount: 0, latest: [] },
    recentActivity: [],
  }
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}
