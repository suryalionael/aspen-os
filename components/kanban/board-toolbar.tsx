"use client"

import { Input } from "@/components/ui/input"
import type { Label } from "@/lib/labels"

export type SortMode = "manual" | "priority" | "due_date" | "newest" | "oldest" | "assignee"

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

export function BoardToolbar({
  searchQuery,
  onSearchQueryChange,
  priorityFilter,
  onPriorityFilterChange,
  labelFilter,
  onLabelFilterChange,
  availableLabels,
  sortMode,
  onSortModeChange,
}: {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  priorityFilter: string
  onPriorityFilterChange: (value: string) => void
  labelFilter: string
  onLabelFilterChange: (value: string) => void
  availableLabels: Label[]
  sortMode: SortMode
  onSortModeChange: (value: SortMode) => void
}) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <Input
        id="board-search-input"
        aria-label="Search tasks"
        placeholder="Search tasks… (press / to focus)"
        value={searchQuery}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        className="h-9 max-w-[220px]"
      />
      <select
        aria-label="Filter by priority"
        value={priorityFilter}
        onChange={(event) => onPriorityFilterChange(event.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">Any priority</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      <select
        aria-label="Filter by label"
        value={labelFilter}
        onChange={(event) => onLabelFilterChange(event.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">Any label</option>
        {availableLabels.map((label) => (
          <option key={label.id} value={label.id}>
            {label.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Sort tasks"
        value={sortMode}
        onChange={(event) => onSortModeChange(event.target.value as SortMode)}
        className={SELECT_CLASS}
      >
        <option value="manual">Manual order</option>
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="priority">Sort by priority</option>
        <option value="due_date">Sort by due date</option>
        <option value="assignee">Sort by assignee</option>
      </select>
    </div>
  )
}
