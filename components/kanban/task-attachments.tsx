"use client"

import { useEffect, useRef, useState, useTransition } from "react"

import {
  deleteAttachment,
  getAttachments,
  uploadAttachment,
  type Attachment,
} from "@/lib/actions/attachments"

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
  const [, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Same StrictMode double-invoke guard used by TaskChecklist/TaskComments
    // — without it, a stale fetch resolving after a later optimistic
    // change can stomp it with outdated data.
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

  // Calling uploadAttachment directly (rather than via <form
  // action={fn}> + useActionState, triggered by a synthetic
  // requestSubmit() from this input's onChange) — that pattern silently
  // never reached the server in production for forms inside this
  // dialog's Radix Portal, even though the file was correctly attached
  // to the input (confirmed directly: no network request for the
  // action ever fired, despite working in dev). Every other mutation in
  // this dialog already calls its action directly from a plain handler;
  // this brings uploads in line with that proven pattern.
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    const formData = new FormData()
    formData.set("taskId", taskId)
    formData.set("file", file)
    startTransition(async () => {
      const result = await uploadAttachment(undefined, formData)
      setUploading(false)
      if (!result || "error" in result) {
        setUploadError(result?.error ?? "Could not upload attachment.")
        return
      }
      const next = [result.attachment, ...attachments]
      setAttachments(next)
      if (fileInputRef.current) fileInputRef.current.value = ""
      onChanged(next.length)
    })
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
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              data-testid="attachment-item"
              className="group flex items-center gap-2"
            >
              {attachment.url ? (
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
          ))}
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
