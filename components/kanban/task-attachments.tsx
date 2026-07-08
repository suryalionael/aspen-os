"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { ExternalLink, FileText, Trash2 } from "lucide-react"

import {
  createAttachmentRecord,
  deleteAttachment,
  getAttachments,
  addDriveAttachment,
  type Attachment,
} from "@/lib/actions/attachments"
import { getFile } from "@/lib/drive/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function TaskAttachments({
  taskId,
  onChanged,
}: {
  taskId: string
  onChanged: (count: number) => void
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [driveLinkInput, setDriveLinkInput] = useState("")
  const [addingDriveLink, setAddingDriveLink] = useState(false)
  const [, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    getAttachments(taskId).then((result) => {
      if (!active) return
      setAttachments("success" in result ? result.attachments : [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [taskId])

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)

    const { createClient } = await import("@/lib/supabase/client")
    const supabase = createClient()
    const lastDotIndex = file.name.lastIndexOf(".")
    const extension =
      lastDotIndex > 0
        ? file.name
            .slice(lastDotIndex)
            .toLowerCase()
            .replace(/[^a-z0-9.]/g, "")
        : ""
    const path = `${taskId}/${crypto.randomUUID()}${extension}`

    const { error: uploadError } = await supabase.storage
      .from("task-attachments")
      .upload(path, file, { contentType: file.type })

    if (uploadError) {
      setUploading(false)
      setUploadError(uploadError.message)
      return
    }

    startTransition(async () => {
      const result = await createAttachmentRecord(
        taskId,
        file.name,
        path,
        file.size,
        file.type || null,
      )
      setUploading(false)
      if (!result || "error" in result) {
        setUploadError(result?.error ?? "Could not save attachment.")
        return
      }
      const next = [result.attachment, ...attachments]
      setAttachments(next)
      if (fileInputRef.current) fileInputRef.current.value = ""
      onChanged(next.length)
    })
  }

  async function handleAddDriveFile() {
    const fileId = driveLinkInput.trim()
    if (!fileId) return

    setUploadError(null)
    setAddingDriveLink(true)

    try {
      const file = await getFile(fileId)
      const result = await addDriveAttachment(taskId, {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        webViewLink: file.webViewLink,
        thumbnailLink: file.thumbnailLink,
        owners: file.owners.map((o) => ({
          displayName: o.displayName,
          email: o.email,
        })),
        modifiedTime: file.modifiedTime,
      })

      if ("error" in result) {
        setUploadError(result.error)
      } else {
        setAttachments((prev) => [result.attachment, ...prev])
        onChanged(attachments.length + 1)
        setDriveLinkInput("")
      }
    } catch {
      setUploadError("Invalid Drive file ID or file not accessible")
    } finally {
      setAddingDriveLink(false)
    }
  }

  function handleDelete(attachment: Attachment) {
    setDeleteError(null)
    const next = attachments.filter((item) => item.id !== attachment.id)
    setAttachments(next)
    startTransition(async () => {
      const result = await deleteAttachment(attachment.id, taskId)
      if ("error" in result) {
        setDeleteError(result.error)
        setAttachments((previous) =>
          previous.some((item) => item.id === attachment.id)
            ? previous
            : [attachment, ...previous]
        )
        return
      }
      onChanged(next.length)
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading attachments…</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((attachment) => {
            const isDrive = !!attachment.driveFileId
            return (
              <li
                key={attachment.id}
                data-testid="attachment-item"
                className="group flex items-center gap-2"
              >
                {isDrive ? (
                  <a
                    href={attachment.driveUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center gap-1.5 truncate text-sm underline-offset-4 hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
                    <span className="truncate">{attachment.fileName}</span>
                    <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  </a>
                ) : attachment.url ? (
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 truncate text-sm underline-offset-4 hover:underline"
                  >
                    {attachment.fileName}
                  </a>
                ) : (
                  <span className="flex-1 truncate text-sm">{attachment.fileName}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(attachment.fileSize)}
                </span>
                <button
                  type="button"
                  aria-label={`Delete "${attachment.fileName}"`}
                  onClick={() => handleDelete(attachment)}
                  className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Attachment"
          onChange={handleFileChange}
          disabled={uploading}
          className="text-sm"
        />
        {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          placeholder="Drive file ID or paste link"
          value={driveLinkInput}
          onChange={(e) => {
            const val = e.target.value
            const match = val.match(/\/d\/([a-zA-Z0-9_-]+)/)
            setDriveLinkInput(match ? match[1] : val)
          }}
          className="h-8 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddDriveFile}
          disabled={addingDriveLink || !driveLinkInput.trim()}
        >
          {addingDriveLink ? "Adding…" : "Add from Drive"}
        </Button>
      </div>
      {uploadError && (
        <p role="alert" className="text-sm text-destructive">
          {uploadError}
        </p>
      )}
      {deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}
    </div>
  )
}
