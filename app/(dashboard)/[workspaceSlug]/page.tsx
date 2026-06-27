import Link from "next/link"
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getWorkspaceBySlug } from "@/lib/data/workspace"
import { formatDateTime } from "@/lib/utils/format-date"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}

const ACTIVITY_VERBS: Record<string, string> = {
  created: "created",
  moved: "moved",
  edited: "updated",
  archived: "archived",
  unarchived: "restored",
  label_added: "added a label to",
  label_removed: "removed a label from",
  checklist_item_added: "added a checklist item to",
  checklist_item_completed: "checked off an item on",
  checklist_item_reopened: "reopened an item on",
  checklist_item_removed: "removed a checklist item from",
  commented: "commented on",
  attachment_added: "added an attachment to",
  attachment_removed: "removed an attachment from",
}

type DashboardTask = {
  id: string
  title: string
  project_id: string
  due_date: string | null
  priority: string | null
}

function TaskRow({
  task,
  workspaceSlug,
  projectName,
}: {
  task: DashboardTask
  workspaceSlug: string
  projectName: string
}) {
  return (
    <li>
      <Link
        href={`/${workspaceSlug}/${task.project_id}?task=${task.id}`}
        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 -mx-2 hover:bg-secondary/50"
      >
        <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {task.priority && <span>{PRIORITY_LABELS[task.priority] ?? task.priority}</span>}
          {task.due_date && <span>{new Date(task.due_date).toLocaleDateString()}</span>}
          <span className="truncate">{projectName}</span>
        </span>
      </Link>
    </li>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params
  const supabase = await createClient()

  const workspace = await getWorkspaceBySlug(workspaceSlug)

  if (!workspace) {
    notFound()
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const timezone =
    typeof user?.user_metadata?.timezone === "string" ? user.user_metadata.timezone : null

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .is("archived_at", null)

  const projectIds = (projects ?? []).map((project) => project.id)
  const projectNameById = new Map((projects ?? []).map((project) => [project.id, project.name]))

  if (!user || projectIds.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          Select a project from the sidebar, or create a new one to get
          started.
        </p>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const [assignedResult, dueTodayResult, upcomingResult, favoritesResult, taskIdsResult] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, project_id, due_date, priority")
        .in("project_id", projectIds)
        .eq("assignee_id", user.id)
        .is("archived_at", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(10),
      supabase
        .from("tasks")
        .select("id, title, project_id, due_date, priority")
        .in("project_id", projectIds)
        .eq("due_date", today)
        .is("archived_at", null)
        .order("priority", { ascending: true })
        .limit(10),
      supabase
        .from("tasks")
        .select("id, title, project_id, due_date, priority")
        .in("project_id", projectIds)
        .gt("due_date", today)
        .lte("due_date", weekAhead)
        .is("archived_at", null)
        .order("due_date", { ascending: true })
        .limit(10),
      supabase
        .from("project_favorites")
        .select("project_id")
        .eq("user_id", user.id)
        .in("project_id", projectIds),
      supabase.from("tasks").select("id, title").in("project_id", projectIds),
    ])

  const taskTitleById = new Map(
    (taskIdsResult.data ?? []).map((task) => [task.id, task.title])
  )
  const allTaskIds = (taskIdsResult.data ?? []).map((task) => task.id)

  const { data: activity } =
    allTaskIds.length > 0
      ? await supabase
          .from("task_activity")
          .select("id, event_type, metadata, created_at, actor_id, task_id")
          .in("task_id", allTaskIds)
          .order("created_at", { ascending: false })
          .limit(10)
      : { data: [] }

  const { data: members } = await supabase.rpc("get_workspace_members_with_email", {
    p_workspace_id: workspace.id,
  })
  const emailByUserId = new Map<string, string>(
    (members ?? []).map((member: { user_id: string; email: string }) => [
      member.user_id,
      member.email,
    ])
  )

  const favoriteProjectIds = new Set(
    (favoritesResult.data ?? []).map((row) => row.project_id)
  )
  const favoriteProjects = (projects ?? []).filter((project) =>
    favoriteProjectIds.has(project.id)
  )

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">{workspace.name}</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assigned to you</CardTitle>
          </CardHeader>
          <CardContent>
            {assignedResult.data?.length ? (
              <ul className="flex flex-col gap-1">
                {assignedResult.data.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    workspaceSlug={workspaceSlug}
                    projectName={projectNameById.get(task.project_id) ?? ""}
                  />
                ))}
              </ul>
            ) : (
              <EmptyRow>No tasks assigned to you yet.</EmptyRow>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Due today</CardTitle>
          </CardHeader>
          <CardContent>
            {dueTodayResult.data?.length ? (
              <ul className="flex flex-col gap-1">
                {dueTodayResult.data.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    workspaceSlug={workspaceSlug}
                    projectName={projectNameById.get(task.project_id) ?? ""}
                  />
                ))}
              </ul>
            ) : (
              <EmptyRow>Nothing due today.</EmptyRow>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming deadlines</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingResult.data?.length ? (
              <ul className="flex flex-col gap-1">
                {upcomingResult.data.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    workspaceSlug={workspaceSlug}
                    projectName={projectNameById.get(task.project_id) ?? ""}
                  />
                ))}
              </ul>
            ) : (
              <EmptyRow>Nothing due in the next 7 days.</EmptyRow>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Favorite projects</CardTitle>
          </CardHeader>
          <CardContent>
            {favoriteProjects.length ? (
              <ul className="flex flex-col gap-1">
                {favoriteProjects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/${workspaceSlug}/${project.id}`}
                      className="block rounded-md px-2 py-1.5 -mx-2 text-sm hover:bg-secondary/50"
                    >
                      {project.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyRow>Star a project to pin it here.</EmptyRow>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity?.length ? (
              <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                {activity.map((entry) => {
                  const verb = ACTIVITY_VERBS[entry.event_type] ?? entry.event_type
                  const actorEmail = entry.actor_id
                    ? emailByUserId.get(entry.actor_id) ?? "Someone"
                    : "Someone"
                  const taskTitle = taskTitleById.get(entry.task_id) ?? "a task"
                  return (
                    <li key={entry.id}>
                      <span className="text-foreground">{actorEmail}</span> {verb}{" "}
                      <span className="text-foreground">&quot;{taskTitle}&quot;</span> ·{" "}
                      {formatDateTime(entry.created_at, timezone)}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyRow>No activity yet.</EmptyRow>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
