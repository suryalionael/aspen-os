import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { KanbanBoard } from "@/components/kanban/kanban-board"
import { ProjectHeader } from "@/components/project/project-header"

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

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", project.workspace_id)
    .eq("user_id", user?.id ?? "")
    .maybeSingle()
  const isAdminOrOwner = membership?.role === "owner" || membership?.role === "admin"
  const isFavorite = project.project_favorites.some((row) => row.user_id === user?.id)

  const { data: memberRows } = await supabase.rpc("get_workspace_members_with_email", {
    p_workspace_id: project.workspace_id,
  })
  const members = (memberRows ?? []).map((member: { user_id: string; email: string }) => ({
    user_id: member.user_id,
    email: member.email,
  }))

  // One indexed query via (project_id, status, position) — see
  // database-schema.md §2 — fetched once here and handed to the client
  // board as its initial, optimistically-managed state.
  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      "id, title, status, description, due_date, priority, assignee_id, created_at, task_labels(labels(id, name, color)), checklist_items(completed), comments(id)"
    )
    .eq("project_id", project.id)
    .is("archived_at", null)
    .order("status", { ascending: true })
    .order("position", { ascending: true })

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
  }))

  const completedCount = tasksWithLabels.filter((task) => task.status === "done").length

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
      />
      <KanbanBoard projectId={project.id} initialTasks={tasksWithLabels} />
    </div>
  )
}
