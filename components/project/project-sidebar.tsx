"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"

import { ProjectCreateDialog } from "@/components/project/project-create-dialog"
import { ProjectFavoriteButton } from "@/components/project/project-favorite-button"
import { ArchivedProjectsDialog } from "@/components/project/archived-projects-dialog"
import { WorkspaceMembersDialog } from "@/components/workspace/workspace-members-dialog"
import { WorkspaceSettingsDialog } from "@/components/workspace/workspace-settings-dialog"
import { AuditLogDialog } from "@/components/workspace/audit-log-dialog"
import { NotificationBell } from "@/components/notifications/notification-bell"
import type { WorkspaceSettings } from "@/lib/actions/workspace-settings"

type Project = { id: string; name: string; isFavorite: boolean }

function ProjectLink({
  project,
  workspaceSlug,
  isActive,
  onNavigate,
}: {
  project: Project
  workspaceSlug: string
  isActive: boolean
  onNavigate: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/${workspaceSlug}/${project.id}`}
        onClick={onNavigate}
        className={`flex-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
          isActive
            ? "bg-secondary font-medium text-foreground"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        }`}
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
  workspaceSettings,
  children,
}: {
  workspaceId: string
  workspaceSlug: string
  projects: Project[]
  currentUserRole: "owner" | "admin" | "member"
  workspaceSettings: WorkspaceSettings
  children: React.ReactNode
}) {
  // Below md, the sidebar has no room to sit alongside the page content
  // (confirmed in a live mobile-viewport walkthrough: a fixed w-56 sidebar
  // left under half the 390px screen for the board/calendar, and Kanban
  // columns ran off-screen). It becomes a slide-in drawer instead, opened
  // by a toggle button that only renders below md — at md and up it's
  // back to the original always-visible layout.
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const favorites = projects.filter((project) => project.isFavorite)
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin"
  const closeDrawer = () => setOpen(false)

  function navLinkClass(href: string, exact = false) {
    const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/")
    return `rounded-md px-2 py-1.5 text-sm transition-colors ${
      isActive
        ? "bg-secondary font-medium text-foreground"
        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
    }`
  }

  return (
    <div className="flex flex-1">
      <button
        type="button"
        aria-label={open ? "Close sidebar" : "Open sidebar"}
        onClick={() => setOpen((previous) => !previous)}
        className="fixed bottom-4 right-4 z-40 rounded-full border border-border bg-background p-3 shadow-md md:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div
          aria-hidden="true"
          onClick={closeDrawer}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-background p-4 transition-transform duration-200 md:static md:z-auto md:w-56 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col gap-1.5 border-b border-border pb-3">
          {/* Two rows, not one — cramming the heading plus all three
              buttons into a single flex row overflowed the sidebar's fixed
              w-56 width, pushing "Members" past the sidebar's right edge
              and into the main content area where it intercepted clicks
              (confirmed directly via boundingBox(): its right edge landed
              at ~290px against a 224px-wide sidebar). Same bug class as
              the earlier "Archived projects" overflow — see DECISION-LOG. */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Workspace
            </h2>
            <NotificationBell workspaceId={workspaceId} workspaceSlug={workspaceSlug} />
          </div>
          <div className="flex items-center gap-1">
            <AuditLogDialog workspaceId={workspaceId} />
            <WorkspaceMembersDialog workspaceId={workspaceId} currentUserRole={currentUserRole} />
          </div>
          <Link
            href={`/${workspaceSlug}`}
            onClick={closeDrawer}
            className={navLinkClass(`/${workspaceSlug}`, true)}
          >
            Home
          </Link>
          <Link
            href={`/${workspaceSlug}/calendar`}
            onClick={closeDrawer}
            className={navLinkClass(`/${workspaceSlug}/calendar`)}
          >
            Calendar
          </Link>
          <Link
            href={`/${workspaceSlug}/notes`}
            onClick={closeDrawer}
            className={navLinkClass(`/${workspaceSlug}/notes`)}
          >
            Notes
          </Link>
          <Link
            href={`/${workspaceSlug}/activity`}
            onClick={closeDrawer}
            className={navLinkClass(`/${workspaceSlug}/activity`)}
          >
            Activity
          </Link>
        </div>

        {isAdminOrOwner && (
          <WorkspaceSettingsDialog
            workspace={workspaceSettings}
            isOwner={currentUserRole === "owner"}
          />
        )}

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
                  isActive={pathname.startsWith(`/${workspaceSlug}/${project.id}`)}
                  onNavigate={closeDrawer}
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
                isActive={pathname.startsWith(`/${workspaceSlug}/${project.id}`)}
                onNavigate={closeDrawer}
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

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
