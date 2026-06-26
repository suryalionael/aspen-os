import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
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

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("slug", workspaceSlug)
    .maybeSingle()

  if (!workspace) {
    notFound()
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: true })

  return (
    <div className="flex flex-1">
      <ProjectSidebar
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        projects={projects ?? []}
      />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
