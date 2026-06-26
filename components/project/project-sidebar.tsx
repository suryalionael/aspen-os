import Link from "next/link"

import { ProjectCreateDialog } from "@/components/project/project-create-dialog"

export function ProjectSidebar({
  workspaceId,
  workspaceSlug,
  projects,
}: {
  workspaceId: string
  workspaceSlug: string
  projects: { id: string; name: string }[]
}) {
  return (
    <aside className="flex w-56 flex-shrink-0 flex-col gap-3 border-r border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Projects
        </h2>
        <ProjectCreateDialog
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
        />
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet</p>
      ) : (
        <nav className="flex flex-col gap-1">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/${workspaceSlug}/${project.id}`}
              className="rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
            >
              {project.name}
            </Link>
          ))}
        </nav>
      )}
    </aside>
  )
}
