import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { KanbanBoard } from "@/components/kanban/kanban-board"
import { ProjectHeader } from "@/components/project/project-header"
import { getAverageProgress } from "@/lib/utils/task-progress"

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>
}) {
  const { projectId, workspaceSlug } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, workspace_id, description, due_date, status, project_favorites(user_id)")
    .eq("id", projectId)
    .maybeSingle()

  if (!project) {
    notFound()
  }

  // All queries after the project fetch are independent — run them in
  // parallel to eliminate sequential round-trips (saves ~400-800ms per
  // page load given cross-region Supabase latency).
  const [
    { data: { user } },
    { data: tasks },
    { data: memberRows },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tasks")
      .select(
        "id, title, status, description, due_date, priority, assignee_id, created_at, progress, task_labels(labels(id, name, color)), checklist_items(completed), comments(id), task_attachments(id), task_assignees(user_id)"
      )
      .eq("project_id", project.id)
      .is("archived_at", null)
      .order("status", { ascending: true })
      .order("position", { ascending: true }),
    supabase.rpc("get_workspace_members_with_email", {
      p_workspace_id: project.workspace_id,
    }),
  ])

  const members = (memberRows ?? []).map((member: { user_id: string; email: string }) => ({
    user_id: member.user_id,
    email: member.email,
  }))

  // Membership check only needs userId — run after user is resolved.
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", project.workspace_id)
    .eq("user_id", user?.id ?? "")
    .maybeSingle()
  const isAdminOrOwner = membership?.role === "owner" || membership?.role === "admin"
  const isFavorite = project.project_favorites.some((row) => row.user_id === user?.id)

  const tasksWithLabels = (tasks ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    description: task.description,
    due_date: task.due_date,
    priority: task.priority,
    assignee_id: task.assignee_id,
    created_at: task.created_at,
    labels: task.task_labels.flatMap((row) =>
      Array.isArray(row.labels) ? row.labels : row.labels ? [row.labels] : []
    ),
    checklistTotal: task.checklist_items.length,
    checklistCompleted: task.checklist_items.filter((item) => item.completed).length,
    commentCount: task.comments.length,
    attachmentCount: task.task_attachments.length,
    progress: task.progress,
    assigneeIds: task.task_assignees.map((row) => row.user_id),
  }))

  const completedCount = tasksWithLabels.filter((task) => task.status === "done").length
  const averageProgress = getAverageProgress(tasksWithLabels)

  return (
    <div className="flex flex-1 flex-col">
      <ProjectHeader
        projectId={project.id}
        workspaceSlug={workspaceSlug}
        initialName={project.name}
        initialDescription={project.description}
        initialDueDate={project.due_date}
        initialStatus={project.status as "active" | "on_hold" | "completed"}
        initialFavorite={isFavorite}
        canManageProject={isAdminOrOwner}
        members={members}
        totalTasks={tasksWithLabels.length}
        completedTasks={completedCount}
        averageProgress={averageProgress}
      />
      <KanbanBoard projectId={project.id} initialTasks={tasksWithLabels} />
    </div>
  )
}
