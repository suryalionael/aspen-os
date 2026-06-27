"use client"

import { useActionState, useEffect, useRef } from "react"

import { createTask } from "@/lib/actions/tasks"
import { Input } from "@/components/ui/input"

export function TaskCreateInline({
  projectId,
  onTaskCreated,
}: {
  projectId: string
  onTaskCreated: (task: { id: string; title: string; status: string }) => void
}) {
  const [state, formAction, isPending] = useActionState(createTask, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  // Stored in a ref (not the effect's dependency array) so the effect only
  // re-fires when `state` itself changes — not on every parent re-render,
  // which would otherwise re-invoke onTaskCreated with stale data using a
  // fresh-but-unrelated callback reference.
  const onTaskCreatedRef = useRef(onTaskCreated)
  onTaskCreatedRef.current = onTaskCreated

  // Quick-add is meant for rapid sequential entry (DEC-015): clear the
  // input after each successful submission instead of leaving the last
  // title sitting there, without navigating away from the board. The new
  // task is added to KanbanBoard's local state directly — that state
  // doesn't re-sync from server revalidation once mounted (see
  // lib/actions/tasks.ts), so this callback is the only way it appears.
  useEffect(() => {
    if (state && "success" in state) {
      formRef.current?.reset()
      onTaskCreatedRef.current(state.task)
    }
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="projectId" value={projectId} />
      <Input
        id="quick-add-input"
        name="title"
        placeholder="Add a task…"
        autoComplete="off"
        required
        disabled={isPending}
        className="h-8 text-sm"
        // Implicit submit-on-Enter for a single-text-field form is
        // unreliable once a hidden input is also present (confirmed by a
        // failing Playwright run, not just a theoretical concern) — submit
        // explicitly instead of relying on it.
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            formRef.current?.requestSubmit()
          }
        }}
      />
      {state && "error" in state && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  )
}
