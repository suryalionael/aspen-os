import Link from "next/link"

import { ProjectCreateDialog } from "@/components/project/project-create-dialog"
import { ProjectFavoriteButton } from "@/components/project/project-favorite-button"
import { ArchivedProjectsDialog } from "@/components/project/archived-projects-dialog"
import { WorkspaceMembersDialog } from "@/components/workspace/workspace-members-dialog"
import { NotificationBell } from "@/components/notifications/notification-bell"

type Project = { id: string; name: string; isFavorite: boolean }

function ProjectLink({
  project,
  workspaceSlug,
}: {
  project: Project
  workspaceSlug: string
}) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/${workspaceSlug}/${project.id}`}
        className="flex-1 rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
      >
        {project.name}
      </Link>
      <ProjectFavoriteButton projectId={project.id} initialFavorite={project.isFavorite} />
    </div>
  )
}

export function ProjectSidebar({
  workspaceId,
  workspaceSlug,
  projects,
  currentUserRole,
}: {
  workspaceId: string
  workspaceSlug: string
  projects: Project[]
  currentUserRole: "owner" | "admin" | "member"
}) {
  const favorites = projects.filter((project) => project.isFavorite)
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin"

  return (
    <aside className="flex w-56 flex-shrink-0 flex-col gap-3 border-r border-border p-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Workspace
        </h2>
        <div className="flex items-center gap-1">
          <NotificationBell workspaceId={workspaceId} workspaceSlug={workspaceSlug} />
          <WorkspaceMembersDialog workspaceId={workspaceId} currentUserRole={currentUserRole} />
        </div>
      </div>

      {favorites.length > 0 && (
        <div className="flex flex-col gap-1">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">
            Favorites
          </h2>
          <nav className="flex flex-col gap-1">
            {favorites.map((project) => (
              <ProjectLink
                key={project.id}
                project={project}
                workspaceSlug={workspaceSlug}
              />
            ))}
          </nav>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Projects
        </h2>
        {/* Project lifecycle management (create/rename/archive/delete) is
            admin+owner only — members "work only" (migration 023). */}
        {isAdminOrOwner && (
          <ProjectCreateDialog
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
          />
        )}
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet</p>
      ) : (
        <nav className="flex flex-col gap-1">
          {projects.map((project) => (
            <ProjectLink
              key={project.id}
              project={project}
              workspaceSlug={workspaceSlug}
            />
          ))}
        </nav>
      )}

      {isAdminOrOwner && (
        <div className="border-t border-border pt-3">
          <ArchivedProjectsDialog workspaceId={workspaceId} />
        </div>
      )}
    </aside>
  )
}
