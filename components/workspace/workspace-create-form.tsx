"use client"

import { useActionState } from "react"

import { createWorkspace } from "@/lib/actions/workspaces"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function WorkspaceCreateForm() {
  const [state, formAction, isPending] = useActionState(
    createWorkspace,
    undefined
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-medium">
          Workspace name
        </label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="off"
          autoFocus
          required
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating workspace…" : "Create workspace"}
      </Button>
    </form>
  )
}
