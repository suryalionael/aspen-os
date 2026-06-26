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
import {
  archiveProject,
  deleteProject,
  renameProject,
} from "@/lib/actions/projects"

export function ProjectSettingsDialog({
  projectId,
  workspaceSlug,
  name,
  onRenamed,
}: {
  projectId: string
  workspaceSlug: string
  name: string
  onRenamed: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState(name)
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

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveProject(projectId)
      if ("success" in result) {
        router.push(`/${workspaceSlug}`)
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteProject(projectId, workspaceSlug)
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
