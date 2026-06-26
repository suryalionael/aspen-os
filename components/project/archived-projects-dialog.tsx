"use client"

import { useEffect, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  getArchivedProjects,
  unarchiveProject,
  type ArchivedProject,
} from "@/lib/actions/projects"

export function ArchivedProjectsDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<ArchivedProject[]>([])
  const [loading, setLoading] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    getArchivedProjects(workspaceId).then((result) => {
      if (!active) return
      setProjects("success" in result ? result.projects : [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [open, workspaceId])

  function handleRestore(project: ArchivedProject) {
    startTransition(async () => {
      const result = await unarchiveProject(project.id)
      if ("success" in result) {
        setProjects((previous) => previous.filter((p) => p.id !== project.id))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Archived projects
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archived projects</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No archived projects</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
              >
                <span>{project.name}</span>
                <Button size="sm" variant="outline" onClick={() => handleRestore(project)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
