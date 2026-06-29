import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getWorkspaceBySlug } from "@/lib/data/workspace"
import { getWorkspaceMeetings } from "@/lib/actions/meetings"
import { getWorkspaceMembers } from "@/lib/actions/workspaces"
import { WorkspaceCalendarClient } from "@/components/calendar/workspace-calendar-client"

export default async function WorkspaceCalendarPage({
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

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, due_date")
    .eq("workspace_id", workspace.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true })

  const projectIds = (projects ?? []).map((project) => project.id)

  const { data: tasks } =
    projectIds.length > 0
      ? await supabase
          .from("tasks")
          .select("id, title, due_date, priority, assignee_id")
          .in("project_id", projectIds)
          .not("due_date", "is", null)
          .is("archived_at", null)
      : { data: [] }

  const [meetingsResult, membersResult] = await Promise.all([
    getWorkspaceMeetings(workspace.id),
    getWorkspaceMembers(workspace.id),
  ])

  const milestoneProjects = (projects ?? [])
    .filter((project) => project.due_date !== null)
    .map((project) => ({ id: project.id, title: project.name, due_date: project.due_date }))

  return (
    <WorkspaceCalendarClient
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
      initialTasks={tasks ?? []}
      initialMeetings={"success" in meetingsResult ? meetingsResult.meetings : []}
      milestoneProjects={milestoneProjects}
      members={"success" in membersResult ? membersResult.members : []}
      projects={(projects ?? []).map((project) => ({ id: project.id, name: project.name }))}
    />
  )
}
