"use client"

import { useActionState, useEffect, useRef, useState, useTransition } from "react"

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
  onChanged: () => void
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadState, uploadAction] = useActionState(uploadAttachment, undefined)
  const [, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

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

  useEffect(() => {
    if (uploadState && "success" in uploadState) {
      setAttachments((previous) => [uploadState.attachment, ...previous])
      formRef.current?.reset()
      onChanged()
    }
    // Runs once per upload result, not on every onChanged identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadState])

  function handleDelete(attachment: Attachment) {
    setAttachments((previous) => previous.filter((item) => item.id !== attachment.id))
    startTransition(async () => {
      const result = await deleteAttachment(attachment.id, taskId)
      if ("success" in result) onChanged()
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
      <form ref={formRef} action={uploadAction} className="flex items-center gap-2">
        <input type="hidden" name="taskId" value={taskId} />
        <input
          type="file"
          name="file"
          aria-label="Attachment"
          onChange={() => formRef.current?.requestSubmit()}
          className="text-sm"
        />
      </form>
      {uploadState && "error" in uploadState && (
        <p role="alert" className="text-sm text-destructive">
          {uploadState.error}
        </p>
      )}
    </div>
  )
}
