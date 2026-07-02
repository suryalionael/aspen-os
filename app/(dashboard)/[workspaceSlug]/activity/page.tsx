import Link from "next/link"
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getWorkspaceBySlug } from "@/lib/data/workspace"
import { formatDateTime } from "@/lib/utils/format-date"
import { describeActivity } from "@/lib/utils/activity-labels"
import { EmptyState } from "@/components/ui/empty-state"

export default async function WorkspaceActivityPage({
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

  const { data: taskRows } =
    projectIds.length > 0
      ? await supabase
          .from("tasks")
          .select("id, title, project_id")
          .in("project_id", projectIds)
      : { data: [] }

  const allTaskIds = (taskRows ?? []).map((task) => task.id)
  const taskTitleById = new Map((taskRows ?? []).map((task) => [task.id, task.title]))
  const taskProjectById = new Map((taskRows ?? []).map((task) => [task.id, task.project_id]))

  const { data: activity } =
    allTaskIds.length > 0
      ? await supabase
          .from("task_activity")
          .select("id, event_type, metadata, created_at, actor_id, task_id")
          .in("task_id", allTaskIds)
          .order("created_at", { ascending: false })
          .limit(50)
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

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">Activity</h1>

      {!activity?.length ? (
        <EmptyState
          icon="📋"
          title="No activity yet"
          description="Task updates, comments, and edits will appear here once your team starts working."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {activity.map((entry) => {
            const actorEmail = entry.actor_id
              ? (emailByUserId.get(entry.actor_id) ?? "Someone")
              : "Someone"
            const taskTitle = taskTitleById.get(entry.task_id) ?? "a task"
            const projectId = taskProjectById.get(entry.task_id)
            const projectName = projectId ? (projectNameById.get(projectId) ?? "") : ""
            const verb = describeActivity(entry.event_type, entry.metadata as Record<string, unknown>)

            return (
              <li key={entry.id} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{actorEmail}</span>
                {" — "}
                {verb}
                {" on "}
                {projectId ? (
                  <Link
                    href={`/${workspaceSlug}/${projectId}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {taskTitle}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{taskTitle}</span>
                )}
                {projectName && (
                  <span className="text-xs">
                    {" "}in{" "}
                    <Link
                      href={`/${workspaceSlug}/${projectId}`}
                      className="hover:underline"
                    >
                      {projectName}
                    </Link>
                  </span>
                )}
                <span className="ml-2 text-xs">· {formatDateTime(entry.created_at, timezone)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
