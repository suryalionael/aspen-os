"use client"

import { useState, useEffect, useTransition } from "react"
import { Folder, FolderOpen, ChevronRight, ChevronDown } from "lucide-react"

import { moveFile, getFolderTree, listFiles } from "@/lib/drive/actions"
import type { DriveFolderTree, DriveFile } from "@/lib/drive/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

function FolderPickerItem({
  node,
  selectedId,
  onSelect,
  depth,
}: {
  node: DriveFolderTree
  selectedId: string | null
  onSelect: (id: string) => void
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
          selectedId === node.id
            ? "bg-primary/10 font-medium text-primary"
            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
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
        {selectedId === node.id ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-primary" />
        ) : (
          <Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground/60" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <FolderPickerItem
            key={child.id}
            node={child}
            selectedId={selectedId}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}

export function MoveDialog({
  open,
  onOpenChange,
  fileId,
  fileName,
  currentFolderId,
  onMoved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileId: string
  fileName: string
  currentFolderId: string | null
  onMoved: () => void
}) {
  const [folderTree, setFolderTree] = useState<DriveFolderTree[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      getFolderTree().then(setFolderTree).catch(() => {})
      setSelectedFolderId(currentFolderId)
      setError(null)
    }
  }, [open, currentFolderId])

  function handleMove() {
    if (!selectedFolderId || selectedFolderId === currentFolderId) {
      onOpenChange(false)
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        await moveFile(fileId, selectedFolderId)
        onMoved()
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move file")
      }
    })
  }

  const selectedName =
    folderTree
      .flatMap((n) => [n, ...flattenTree(n.children)])
      .find((n) => n.id === selectedFolderId)?.name ?? ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move &ldquo;{fileName}&rdquo;</DialogTitle>
          <DialogDescription>Choose a destination folder in the workspace.</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border p-2">
          {folderTree.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading folders…</p>
          ) : (
            folderTree.map((node) => (
              <FolderPickerItem
                key={node.id}
                node={node}
                selectedId={selectedFolderId}
                onSelect={setSelectedFolderId}
                depth={0}
              />
            ))
          )}
        </div>
        {selectedFolderId && selectedFolderId !== currentFolderId && (
          <p className="text-xs text-muted-foreground">
            Moving to: <span className="font-medium">{selectedName}</span>
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleMove}
            disabled={isPending || !selectedFolderId || selectedFolderId === currentFolderId}
          >
            {isPending ? "Moving…" : "Move here"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function flattenTree(nodes: DriveFolderTree[]): DriveFolderTree[] {
  const result: DriveFolderTree[] = []
  for (const node of nodes) {
    result.push(node, ...flattenTree(node.children))
  }
  return result
}
