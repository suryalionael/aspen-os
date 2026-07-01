"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"

import { searchWorkspaceTasks, type SearchResult } from "@/lib/actions/search"

type Project = { id: string; name: string }

const ITEM_CLASS =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-secondary"

export function CommandPalette({
  workspaceSlug,
  workspaceId,
  projects,
}: {
  workspaceSlug: string
  workspaceId: string
  projects: Project[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [, startTransition] = useTransition()
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

  useEffect(() => {
    if (!open) {
      setQuery("")
      setSearchResults([])
    }
  }, [open])

  useEffect(() => {
    if (!query.trim() || !open) {
      setSearchResults([])
      return
    }
    startTransition(async () => {
      const result = await searchWorkspaceTasks(workspaceId, query)
      if ("success" in result) {
        setSearchResults(result.results)
      }
    })
  }, [query, workspaceId, open])

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
        shouldFilter={searchResults.length === 0}
      >
        <Command.Input
          placeholder="Search tasks, jump to project or page…"
          className="w-full border-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          data-testid="command-palette-input"
          autoFocus
          value={query}
          onValueChange={setQuery}
        />
        <Command.List className="max-h-80 overflow-y-auto border-t border-border">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          {searchResults.length > 0 && (
            <Command.Group
              heading="Tasks"
              className="px-2 pb-2 pt-2 text-xs font-medium text-muted-foreground"
            >
              {searchResults.map((result) => (
                <Command.Item
                  key={result.id}
                  value={`task ${result.title}`}
                  onSelect={() => go(`/${workspaceSlug}/${result.project_id}`)}
                  className={ITEM_CLASS}
                >
                  <span className="truncate">{result.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {result.project_name}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group
            heading="Workspace"
            className="px-2 pb-2 pt-2 text-xs font-medium text-muted-foreground"
          >
            <Command.Item
              value="calendar workspace calendar"
              onSelect={() => go(`/${workspaceSlug}/calendar`)}
              className={ITEM_CLASS}
            >
              Calendar
            </Command.Item>
            <Command.Item
              value="notes documents workspace notes"
              onSelect={() => go(`/${workspaceSlug}/notes`)}
              className={ITEM_CLASS}
            >
              Notes
            </Command.Item>
            <Command.Item
              value="activity workspace activity feed"
              onSelect={() => go(`/${workspaceSlug}/activity`)}
              className={ITEM_CLASS}
            >
              Activity
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
                  className={ITEM_CLASS}
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
              className={ITEM_CLASS}
            >
              New meeting → Calendar
            </Command.Item>
            <Command.Item
              value="new note create note document"
              onSelect={() => go(`/${workspaceSlug}/notes`)}
              className={ITEM_CLASS}
            >
              New note → Notes
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}
