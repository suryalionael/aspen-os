"use client"

import { useActionState, useEffect, useRef } from "react"

import { createTask } from "@/lib/actions/tasks"
import { Input } from "@/components/ui/input"

export function TaskCreateInline({ projectId }: { projectId: string }) {
  const [state, formAction, isPending] = useActionState(createTask, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  // Quick-add is meant for rapid sequential entry (DEC-015): clear the
  // input after each successful submission instead of leaving the last
  // title sitting there, without navigating away from the board.
  useEffect(() => {
    if (state && "success" in state) {
      formRef.current?.reset()
    }
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="projectId" value={projectId} />
      <Input
        name="title"
        placeholder="Add a task…"
        autoComplete="off"
        required
        disabled={isPending}
        className="h-8 text-sm"
      />
      {state && "error" in state && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  )
}
