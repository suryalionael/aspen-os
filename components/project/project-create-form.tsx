"use client"

import { useActionState } from "react"

import { createProject } from "@/lib/actions/projects"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ProjectCreateForm({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string
  workspaceSlug: string
}) {
  const [state, formAction, isPending] = useActionState(
    createProject,
    undefined
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
      <div className="flex flex-col gap-2">
        <label htmlFor="project-name" className="text-sm font-medium">
          Project name
        </label>
        <Input
          id="project-name"
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
        {isPending ? "Creating project…" : "Create project"}
      </Button>
    </form>
  )
}
