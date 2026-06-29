"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  archiveProject,
  deleteProject,
  renameProject,
  updateProjectDetails,
  type ProjectStatus,
} from "@/lib/actions/projects"

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
]

export function ProjectSettingsDialog({
  projectId,
  workspaceSlug,
  name,
  description,
  dueDate,
  status,
  onRenamed,
  onDetailsChanged,
}: {
  projectId: string
  workspaceSlug: string
  name: string
  description: string | null
  dueDate: string | null
  status: ProjectStatus
  onRenamed: (name: string) => void
  onDetailsChanged: (details: { description: string | null; due_date: string | null; status: ProjectStatus }) => void
}) {
  const [open, setOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState(name)
  const [descriptionDraft, setDescriptionDraft] = useState(description ?? "")
  const [dueDateDraft, setDueDateDraft] = useState(dueDate ?? "")
  const [statusDraft, setStatusDraft] = useState<ProjectStatus>(status)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleRename() {
    setError(null)
    startTransition(async () => {
      const result = await renameProject(projectId, nameDraft)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onRenamed(result.name)
    })
  }

  function handleSaveDetails() {
    setError(null)
    startTransition(async () => {
      const result = await updateProjectDetails(projectId, {
        description: descriptionDraft,
        dueDate: dueDateDraft,
        status: statusDraft,
      })
      if ("error" in result) {
        setError(result.error)
        return
      }
      onDetailsChanged(result.details)
    })
  }

  function handleArchive() {
    setError(null)
    startTransition(async () => {
      const result = await archiveProject(projectId)
      if ("error" in result) {
        setError(result.error)
        return
      }
      router.push(`/${workspaceSlug}`)
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteProject(projectId, workspaceSlug)
      if ("error" in result) {
        setError(result.error)
        return
      }
      router.push(`/${workspaceSlug}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Project settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="project-name" className="text-sm font-medium">
            Name
          </label>
          <div className="flex gap-2">
            <Input
              id="project-name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
            />
            <Button size="sm" onClick={handleRename} disabled={pending}>
              Save
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="project-description"
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              rows={2}
              placeholder="What is this project about?"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="project-due-date" className="text-sm font-medium">
                Due date
              </label>
              <Input
                id="project-due-date"
                type="date"
                value={dueDateDraft}
                onChange={(event) => setDueDateDraft(event.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="project-status" className="text-sm font-medium">
                Status
              </label>
              <select
                id="project-status"
                value={statusDraft}
                onChange={(event) => setStatusDraft(event.target.value as ProjectStatus)}
                className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button size="sm" onClick={handleSaveDetails} disabled={pending} className="self-start">
            Save details
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={handleArchive} disabled={pending}>
            Archive project
          </Button>
          {confirmingDelete ? (
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={pending}>
              Confirm delete
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete project
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
