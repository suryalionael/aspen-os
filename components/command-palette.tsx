"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"

type Project = { id: string; name: string }

export function CommandPalette({
  workspaceSlug,
  projects,
}: {
  workspaceSlug: string
  projects: Project[]
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault()
        setOpen((previous) => !previous)
      }
      if (event.key === "Escape") {
        setOpen(false)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  function go(path: string) {
    router.push(path)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      data-testid="command-palette-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] bg-black/40"
      onClick={() => setOpen(false)}
    >
      <Command
        data-testid="command-palette"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        loop
      >
        <Command.Input
          placeholder="Search or jump to…"
          className="w-full border-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          data-testid="command-palette-input"
          autoFocus
        />
        <Command.List className="max-h-80 overflow-y-auto border-t border-border">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          <Command.Group
            heading="Workspace"
            className="px-2 pb-2 pt-2 text-xs font-medium text-muted-foreground [&>[cmdk-group-heading]]:px-2 [&>[cmdk-group-heading]]:py-1.5"
          >
            <Command.Item
              value="calendar workspace calendar"
              onSelect={() => go(`/${workspaceSlug}/calendar`)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-secondary"
            >
              Calendar
            </Command.Item>
            <Command.Item
              value="notes documents workspace notes"
              onSelect={() => go(`/${workspaceSlug}/notes`)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-secondary"
            >
              Notes
            </Command.Item>
          </Command.Group>

          {projects.length > 0 && (
            <Command.Group
              heading="Projects"
              className="px-2 pb-2 pt-2 text-xs font-medium text-muted-foreground"
            >
              {projects.map((project) => (
                <Command.Item
                  key={project.id}
                  value={`project ${project.name}`}
                  onSelect={() => go(`/${workspaceSlug}/${project.id}`)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-secondary"
                >
                  {project.name}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group
            heading="Create"
            className="px-2 pb-2 pt-2 text-xs font-medium text-muted-foreground"
          >
            <Command.Item
              value="new meeting create meeting"
              onSelect={() => go(`/${workspaceSlug}/calendar`)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-secondary"
            >
              New meeting → Calendar
            </Command.Item>
            <Command.Item
              value="new note create note document"
              onSelect={() => go(`/${workspaceSlug}/notes`)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-secondary"
            >
              New note → Notes
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}
