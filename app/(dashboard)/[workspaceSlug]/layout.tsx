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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", user?.id ?? "")
    .maybeSingle()

  return (
    <div className="flex flex-1">
      <ProjectSidebar
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        projects={projects ?? []}
        isOwner={membership?.role === "owner"}
      />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
