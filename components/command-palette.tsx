"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { Folder, FileText, Users, BookOpen, FolderOpen, File as FileIcon, Star, Clock, ExternalLink } from "lucide-react"

import { unifiedSearch, type SearchResultItem } from "@/lib/actions/search"

type Project = { id: string; name: string }

const ITEM_CLASS =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-secondary"

const typeIcons: Record<string, React.ReactNode> = {
  task: <Star className="h-4 w-4 text-blue-500" />,
  project: <Folder className="h-4 w-4 text-amber-500" />,
  note: <BookOpen className="h-4 w-4 text-green-500" />,
  person: <Users className="h-4 w-4 text-purple-500" />,
  drive_file: <FileIcon className="h-4 w-4 text-blue-400" />,
  drive_folder: <FolderOpen className="h-4 w-4 text-blue-400" />,
}

const typeLabels: Record<string, string> = {
  task: "Tasks",
  project: "Projects",
  note: "Notes",
  person: "People",
  drive_file: "Drive files",
  drive_folder: "Drive folders",
}

const typeOrder = ["task", "project", "note", "drive_file", "drive_folder", "person"] as const

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
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
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
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await unifiedSearch(workspaceId, workspaceSlug, query)
        if ("success" in result) {
          setSearchResults(result.results)
        }
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [query, workspaceId, workspaceSlug, open])

  function go(path: string) {
    if (path.startsWith("http")) {
      window.open(path, "_blank")
    } else {
      router.push(path)
    }
    setOpen(false)
  }

  if (!open) return null

  const grouped = typeOrder
    .map((type) => ({
      type,
      label: typeLabels[type],
      icon: typeIcons[type],
      items: searchResults.filter((r) => r.type === type),
    }))
    .filter((g) => g.items.length > 0)

  const hasResults = grouped.length > 0

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
        shouldFilter={false}
      >
        <Command.Input
          placeholder="Search tasks, projects, files, people…"
          className="w-full border-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          data-testid="command-palette-input"
          autoFocus
          value={query}
          onValueChange={setQuery}
        />
        <Command.List className="max-h-96 overflow-y-auto border-t border-border">
          {!hasResults && query.trim() && (
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>
          )}

          {hasResults &&
            grouped.map((group) => (
              <Command.Group
                key={group.type}
                heading={
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    {group.icon}
                    <span>{group.label}</span>
                  </div>
                }
                className="px-2 pb-2 pt-2 text-xs font-medium text-muted-foreground"
              >
                {group.items.map((result) => (
                  <Command.Item
                    key={`${result.type}-${result.id}`}
                    value={`${result.type} ${result.title}`}
                    onSelect={() => go(result.url)}
                    className={ITEM_CLASS}
                  >
                    <span className="truncate">{result.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {result.type === "drive_file" || result.type === "drive_folder" ? (
                        <ExternalLink className="h-3 w-3" />
                      ) : (
                        result.subtitle
                      )}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}

          {!hasResults && !query.trim() && (
            <>
              <Command.Group
                heading="Quick actions"
                className="px-2 pb-2 pt-2 text-xs font-medium text-muted-foreground"
              >
                <Command.Item
                  value="calendar workspace calendar"
                  onSelect={() => go(`/${workspaceSlug}/calendar`)}
                  className={ITEM_CLASS}
                >
                  <Clock className="h-4 w-4" />
                  Calendar
                </Command.Item>
                <Command.Item
                  value="notes documents workspace notes"
                  onSelect={() => go(`/${workspaceSlug}/notes`)}
                  className={ITEM_CLASS}
                >
                  <BookOpen className="h-4 w-4" />
                  Notes
                </Command.Item>
                <Command.Item
                  value="workspace drive files"
                  onSelect={() => go(`/${workspaceSlug}/workspace`)}
                  className={ITEM_CLASS}
                >
                  <FolderOpen className="h-4 w-4" />
                  Workspace Drive
                </Command.Item>
                <Command.Item
                  value="activity workspace activity feed"
                  onSelect={() => go(`/${workspaceSlug}/activity`)}
                  className={ITEM_CLASS}
                >
                  <FileText className="h-4 w-4" />
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
                      <Folder className="h-4 w-4" />
                      {project.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </>
          )}
        </Command.List>
      </Command>
    </div>
  )
}
