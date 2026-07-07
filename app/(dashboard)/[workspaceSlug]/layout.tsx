import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getWorkspaceBySlug, getProjectsForWorkspace } from "@/lib/data/workspace"
import { ProjectSidebar } from "@/components/project/project-sidebar"
import { LazyCommandPalette } from "@/components/lazy-cmd"

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params
  const supabase = await createClient()

  const [workspace, { data: { session } }] = await Promise.all([
    getWorkspaceBySlug(workspaceSlug),
    supabase.auth.getSession(),
  ])

  if (!workspace) {
    notFound()
  }

  const user = session?.user

  const [projects, { data: membership }] = await Promise.all([
    getProjectsForWorkspace(workspace.id),
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace.id)
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
  ])

  const projectsWithFavorite = projects.map((project) => ({
    id: project.id,
    name: project.name,
    isFavorite: project.project_favorites.some((row) => row.user_id === user?.id),
  }))

  const currentUserRole =
    membership?.role === "owner" || membership?.role === "admin"
      ? membership.role
      : "member"

  return (
    <>
      <ProjectSidebar
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        projects={projectsWithFavorite}
        currentUserRole={currentUserRole}
        workspaceSettings={{
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          logoUrl: workspace.logo_url,
          defaultTimezone: workspace.default_timezone,
          archivedAt: workspace.archived_at,
        }}
      >
        {children}
      </ProjectSidebar>
      <LazyCommandPalette
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        projects={projectsWithFavorite}
      />
    </>
  )
}
