"use client"

import { useState } from "react"

import { ProjectSettingsDialog } from "@/components/project/project-settings-dialog"
import { ProjectFavoriteButton } from "@/components/project/project-favorite-button"
import type { ProjectStatus } from "@/lib/actions/projects"

const STATUS_STYLES: Record<ProjectStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  on_hold: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
}

// Postgres `date` columns come back as a bare "YYYY-MM-DD" string - see
// the identical reasoning in task-card.tsx's formatDueDate.
function formatDueDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString()
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase()
}

export function ProjectHeader({
  projectId,
  workspaceSlug,
  initialName,
  initialDescription,
  initialDueDate,
  initialStatus,
  initialFavorite,
  canManageProject,
  members,
  totalTasks,
  completedTasks,
}: {
  projectId: string
  workspaceSlug: string
  initialName: string
  initialDescription: string | null
  initialDueDate: string | null
  initialStatus: ProjectStatus
  initialFavorite: boolean
  canManageProject: boolean
  members: { user_id: string; email: string }[]
  totalTasks: number
  completedTasks: number
}) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [dueDate, setDueDate] = useState(initialDueDate)
  const [status, setStatus] = useState(initialStatus)

  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const visibleMembers = members.slice(0, 5)
  const overflowCount = members.length - visibleMembers.length

  return (
    <div className="flex flex-col gap-3 border-b border-border px-6 py-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
          <ProjectFavoriteButton
            projectId={projectId}
            initialFavorite={initialFavorite}
            size="h-5 w-5"
          />
          <span
            className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
          >
            {STATUS_LABELS[status]}
          </span>
        </div>
        {/* Rename/archive/delete/details are admin+owner only (migration
            023) — a plain member can fully work within the project but not
            manage its lifecycle. */}
        {canManageProject && (
          <ProjectSettingsDialog
            projectId={projectId}
            workspaceSlug={workspaceSlug}
            name={name}
            description={description}
            dueDate={dueDate}
            status={status}
            onRenamed={setName}
            onDetailsChanged={(details) => {
              setDescription(details.description)
              setDueDate(details.due_date)
              setStatus(details.status)
            }}
          />
        )}
      </div>

      {description && <p className="text-sm text-muted-foreground">{description}</p>}

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {members.length > 0 && (
          <div className="flex items-center">
            {visibleMembers.map((member) => (
              <span
                key={member.user_id}
                title={member.email}
                className="-ml-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-secondary text-[10px] font-medium text-secondary-foreground first:ml-0"
              >
                {initials(member.email)}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="-ml-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium">
                +{overflowCount}
              </span>
            )}
          </div>
        )}

        {dueDate && <span>Due {formatDueDate(dueDate)}</span>}

        {totalTasks > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span>
              {completedTasks}/{totalTasks} done ({progressPercent}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
