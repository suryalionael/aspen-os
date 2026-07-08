"use client"

import { useState, useEffect } from "react"
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Building2,
} from "lucide-react"

import type { DriveFolderTree } from "@/lib/drive/types"
import { getFolderTree } from "@/lib/drive/actions"
import { cn } from "@/lib/utils"

function FolderTreeItem({
  node,
  currentFolderId,
  onSelect,
  depth,
}: {
  node: DriveFolderTree
  currentFolderId: string | null
  onSelect: (folderId: string) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setExpanded(!expanded)
          onSelect(node.id)
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          currentFolderId === node.id
            ? "bg-secondary font-medium text-foreground"
            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        {currentFolderId === node.id ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-blue-500" />
        ) : (
          <Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground/60" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <FolderTreeItem
            key={child.id}
            node={child}
            currentFolderId={currentFolderId}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}

export function DriveSidebar({
  currentFolderId,
  onFolderSelect,
  onNavigateRoot,
}: {
  currentFolderId: string | null
  onFolderSelect: (folderId: string) => void
  onNavigateRoot: () => void
}) {
  const [folderTree, setFolderTree] = useState<DriveFolderTree[]>([])

  useEffect(() => {
    getFolderTree().then(setFolderTree).catch(() => {})
  }, [])

  return (
    <aside className="flex w-56 flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-3">
      <button
        type="button"
        onClick={onNavigateRoot}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/50"
      >
        <Building2 className="h-4 w-4 text-primary" />
        <span>Aspen Training Centre</span>
      </button>

      <div className="my-2 border-t border-border" />

      {folderTree.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {folderTree.map((node) => (
            <FolderTreeItem
              key={node.id}
              node={node}
              currentFolderId={currentFolderId}
              onSelect={onFolderSelect}
              depth={0}
            />
          ))}
        </div>
      ) : (
        <p className="px-2 text-xs text-muted-foreground">No folders yet</p>
      )}
    </aside>
  )
}
