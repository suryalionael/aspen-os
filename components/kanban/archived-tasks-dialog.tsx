"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

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

const ROW_HEIGHT_PX = 48

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
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setLoading(true)
    getArchivedTasks(projectId).then((result) => {
      setTasks("success" in result ? result.tasks : [])
      setLoading(false)
    })
  }, [open, projectId])

  function handleRestore(task: ArchivedTask) {
    setError(null)
    startTransition(async () => {
      const result = await unarchiveTask(task.id)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setTasks((previous) => previous.filter((t) => t.id !== task.id))
      onTaskRestored(task)
    })
  }

  // No drag-and-drop in this list (unlike the Kanban board's task cards),
  // so virtualizing here carries none of the risk virtualizing an active
  // dnd-kit SortableContext would — a clean place to address Phase O's
  // "virtualized task lists" without touching the board's already
  // thoroughly-tested drag interaction.
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
  })

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
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No archived tasks</p>
        ) : (
          <div ref={scrollRef} className="max-h-80 overflow-y-auto">
            <div
              style={{ height: virtualizer.getTotalSize(), position: "relative" }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const task = tasks[virtualRow.index]
                return (
                  <div
                    key={task.id}
                    data-testid="archived-task-row"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex items-center justify-between gap-2 px-0.5 pb-2"
                  >
                    <div className="flex w-full items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                      <span>{task.title}</span>
                      <Button size="sm" variant="outline" onClick={() => handleRestore(task)}>
                        Restore
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
