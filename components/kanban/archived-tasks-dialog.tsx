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
  getArchivedTasks,
  unarchiveTask,
  type ArchivedTask,
} from "@/lib/actions/tasks"

export function ArchivedTasksDialog({
  projectId,
  onTaskRestored,
}: {
  projectId: string
  onTaskRestored: (task: ArchivedTask) => void
}) {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<ArchivedTask[]>([])
  const [loading, setLoading] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getArchivedTasks(projectId).then((result) => {
      setTasks("success" in result ? result.tasks : [])
      setLoading(false)
    })
  }, [open, projectId])

  function handleRestore(task: ArchivedTask) {
    startTransition(async () => {
      const result = await unarchiveTask(task.id)
      if ("success" in result) {
        setTasks((previous) => previous.filter((t) => t.id !== task.id))
        onTaskRestored(task)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Archived
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archived tasks</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No archived tasks</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
              >
                <span>{task.title}</span>
                <Button size="sm" variant="outline" onClick={() => handleRestore(task)}>
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
