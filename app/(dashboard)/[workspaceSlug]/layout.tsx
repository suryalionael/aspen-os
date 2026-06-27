import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getWorkspaceBySlug } from "@/lib/data/workspace"
import { ProjectSidebar } from "@/components/project/project-sidebar"

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
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
    .select("id, name, project_favorites(user_id)")
    .eq("workspace_id", workspace.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", user?.id ?? "")
    .maybeSingle()

  const projectsWithFavorite = (projects ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    isFavorite: project.project_favorites.some((row) => row.user_id === user?.id),
  }))

  const currentUserRole =
    membership?.role === "owner" || membership?.role === "admin"
      ? membership.role
      : "member"

  return (
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
  )
}
