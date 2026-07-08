"use client"

import { useState, useTransition } from "react"

import { renameFile } from "@/lib/drive/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function RenameDialog({
  open,
  onOpenChange,
  fileId,
  currentName,
  onRenamed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileId: string
  currentName: string
  onRenamed: () => void
}) {
  const [name, setName] = useState(currentName)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === currentName) {
      onOpenChange(false)
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        await renameFile(fileId, trimmed)
        onRenamed()
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rename")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>Enter a new name for this file or folder.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onFocus={(e) => e.target.select()}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
