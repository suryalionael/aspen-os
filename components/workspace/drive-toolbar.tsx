"use client"

import { useState, useCallback } from "react"
import {
  Upload,
  FolderPlus,
  Grid3X3,
  List,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DriveViewMode, DriveSortField, DriveSortOrder } from "@/lib/drive/types"

export function DriveToolbar({
  viewMode,
  onViewModeChange,
  sortField,
  sortOrder,
  onSortChange,
  searchQuery,
  onSearchChange,
  onUpload,
  onNewFolder,
  loading,
}: {
  viewMode: DriveViewMode
  onViewModeChange: (mode: DriveViewMode) => void
  sortField: DriveSortField
  sortOrder: DriveSortOrder
  onSortChange: (field: DriveSortField, order: DriveSortOrder) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  onUpload: () => void
  onNewFolder: () => void
  loading: boolean
}) {
  const [searchOpen, setSearchOpen] = useState(false)

  const toggleSort = useCallback(
    (field: DriveSortField) => {
      if (sortField === field) {
        onSortChange(field, sortOrder === "asc" ? "desc" : "asc")
      } else {
        onSortChange(field, "asc")
      }
    },
    [sortField, sortOrder, onSortChange]
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search Drive..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => toggleSort("name")}
            className="gap-1"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            Name
            {sortField === "name" && (
              sortOrder === "asc" ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => toggleSort("modifiedTime")}
            className="gap-1"
          >
            Modified
            {sortField === "modifiedTime" && (
              sortOrder === "asc" ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )
            )}
          </Button>
        </div>

        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <Button
            type="button"
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => onViewModeChange("grid")}
            aria-label="Grid view"
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => onViewModeChange("list")}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onUpload}
          disabled={loading}
        >
          <Upload className="h-4 w-4" />
          Upload
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNewFolder}
          disabled={loading}
        >
          <FolderPlus className="h-4 w-4" />
          New folder
        </Button>
      </div>
    </div>
  )
}
