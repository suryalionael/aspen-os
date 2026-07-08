import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { ProjectFilesBrowser } from "@/components/workspace/project-files-browser"
import { ProjectTabNav } from "@/components/project/project-tab-nav"

export default async function ProjectFilesPage(props: {
  params: Promise<{ workspaceSlug: string; projectId: string }>
}) {
  const { workspaceSlug, projectId } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, workspace_id")
    .eq("id", projectId)
    .maybeSingle()

  if (!project) notFound()

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border/60 px-6 py-3">
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <ProjectTabNav
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          activeTab="files"
        />
      </div>
      <ProjectFilesBrowser projectId={projectId} />
    </div>
  )
}
