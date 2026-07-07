import { notFound } from "next/navigation"
import { Suspense } from "react"

import { createClient } from "@/lib/supabase/server"
import { getWorkspaceBySlug, getProjectsForWorkspace } from "@/lib/data/workspace"
import { getWorkspaceMeetings } from "@/lib/actions/meetings"
import { WorkspaceCalendarClient } from "@/components/calendar/workspace-calendar-client"

function CalendarSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="flex gap-2">
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex-1 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}

async function CalendarContent({ workspaceSlug }: { workspaceSlug: string }) {
  const supabase = await createClient()
  const workspace = await getWorkspaceBySlug(workspaceSlug)
  if (!workspace) notFound()

  const projects = await getProjectsForWorkspace(workspace.id)
  const projectIds = projects.map((project) => project.id)

  const [{ data: tasks }, { data: memberRows }] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("tasks")
          .select("id, title, due_date, priority, assignee_id")
          .in("project_id", projectIds)
          .not("due_date", "is", null)
          .is("archived_at", null)
          .neq("status", "done")
      : Promise.resolve({ data: [] as { id: string; title: string; due_date: string | null; priority: string | null; assignee_id: string | null }[] }),
    supabase.rpc("get_workspace_members_with_email", {
      p_workspace_id: workspace.id,
    }),
  ])
  const members = (memberRows ?? []).map((member: { user_id: string; email: string }) => ({
    user_id: member.user_id,
    email: member.email,
  }))
  const emailByUserId = new Map<string, string>(
    members.map((m: { user_id: string; email: string }) => [m.user_id, m.email])
  )

  const meetingsResult = await getWorkspaceMeetings(workspace.id, emailByUserId)

  const milestoneProjects = projects
    .filter((project) => project.due_date !== null)
    .map((project) => ({ id: project.id, title: project.name, due_date: project.due_date }))

  return (
    <WorkspaceCalendarClient
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
      initialTasks={tasks ?? []}
      initialMeetings={"success" in meetingsResult ? meetingsResult.meetings : []}
      milestoneProjects={milestoneProjects}
      members={members}
      projects={projects.map((project) => ({ id: project.id, name: project.name }))}
    />
  )
}

export default async function WorkspaceCalendarPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params

  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarContent workspaceSlug={workspaceSlug} />
    </Suspense>
  )
}
