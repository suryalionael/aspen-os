"use client"

import { useState } from "react"

import { ProjectSettingsDialog } from "@/components/project/project-settings-dialog"

export function ProjectHeader({
  projectId,
  workspaceSlug,
  initialName,
  canManageProject,
}: {
  projectId: string
  workspaceSlug: string
  initialName: string
  canManageProject: boolean
}) {
  const [name, setName] = useState(initialName)

  return (
    <div className="flex items-center justify-between border-b border-border px-6 py-4">
      <h1 className="text-lg font-semibold">{name}</h1>
      {/* Rename/archive/delete are admin+owner only (migration 023) — a
          plain member can fully work within the project but not manage
          its lifecycle. */}
      {canManageProject && (
        <ProjectSettingsDialog
          projectId={projectId}
          workspaceSlug={workspaceSlug}
          name={name}
          onRenamed={setName}
        />
      )}
    </div>
  )
}
