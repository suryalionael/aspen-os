"use client"

import { useState } from "react"

import { ProjectSettingsDialog } from "@/components/project/project-settings-dialog"

export function ProjectHeader({
  projectId,
  workspaceSlug,
  initialName,
}: {
  projectId: string
  workspaceSlug: string
  initialName: string
}) {
  const [name, setName] = useState(initialName)

  return (
    <div className="flex items-center justify-between border-b border-border px-6 py-4">
      <h1 className="text-lg font-semibold">{name}</h1>
      <ProjectSettingsDialog
        projectId={projectId}
        workspaceSlug={workspaceSlug}
        name={name}
        onRenamed={setName}
      />
    </div>
  )
}
