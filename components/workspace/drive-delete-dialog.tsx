"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"

import { trashFile } from "@/lib/drive/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function DeleteDialog({
  open,
  onOpenChange,
  fileId,
  fileName,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileId: string
  fileName: string
  onDeleted: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      try {
        await trashFile(fileId)
        onDeleted()
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete file")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle>Move to trash</DialogTitle>
              <DialogDescription>
                Are you sure you want to move &ldquo;{fileName}&rdquo; to the Google Drive trash?
                You can restore it later from Google Drive.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "Moving to trash…" : "Move to trash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
