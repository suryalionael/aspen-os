"use client"

import { useEffect, useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  addComment,
  deleteComment,
  editComment,
  getComments,
  type Comment,
} from "@/lib/actions/comments"

export function TaskComments({
  taskId,
  onChanged,
}: {
  taskId: string
  onChanged: (count: number) => void
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [newContent, setNewContent] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Guards against React StrictMode's double-invoked effects in
    // development — see the same fix in TaskChecklist/TaskLabelPicker.
    let active = true
    setLoading(true)
    getComments(taskId).then((result) => {
      if (!active) return
      if ("success" in result) {
        setComments(result.comments)
        setCurrentUserId(result.currentUserId)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [taskId])

  function handleAdd() {
    const content = newContent.trim()
    if (!content) return
    setError(null)
    startTransition(async () => {
      const result = await addComment(taskId, content)
      if ("error" in result) {
        setError(result.error)
        return
      }
      const next = [...comments, result.comment]
      setComments(next)
      setNewContent("")
      inputRef.current?.focus()
      onChanged(next.length)
    })
  }

  function handleStartEdit(comment: Comment) {
    setEditingId(comment.id)
    setEditDraft(comment.content)
  }

  function handleSaveEdit() {
    const content = editDraft.trim()
    if (!content || !editingId) return
    const id = editingId
    startTransition(async () => {
      const result = await editComment(id, content)
      if ("success" in result) {
        setComments((previous) =>
          previous.map((comment) => (comment.id === id ? result.comment : comment))
        )
        setEditingId(null)
      }
    })
  }

  function handleDelete(comment: Comment) {
    const next = comments.filter((existing) => existing.id !== comment.id)
    setComments(next)
    startTransition(async () => {
      const result = await deleteComment(comment.id)
      if ("success" in result) onChanged(next.length)
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading comments…</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              data-testid="comment-item"
              className="group flex flex-col gap-1 rounded-md border border-border p-2"
            >
              {editingId === comment.id ? (
                <div className="flex flex-col gap-1.5">
                  <Textarea
                    aria-label="Edit comment"
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    rows={2}
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={handleSaveEdit}>
                      Save comment
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(comment.created_at).toLocaleString()}
                      {comment.updated_at !== comment.created_at ? " (edited)" : ""}
                    </span>
                    {comment.author_id === currentUserId && (
                      <span className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          aria-label="Edit comment"
                          onClick={() => handleStartEdit(comment)}
                          className="text-xs text-muted-foreground underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          aria-label="Delete comment"
                          onClick={() => handleDelete(comment)}
                          className="text-xs text-muted-foreground underline"
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <Textarea
          ref={inputRef}
          aria-label="New comment"
          placeholder="Write a comment…"
          value={newContent}
          onChange={(event) => setNewContent(event.target.value)}
          rows={2}
        />
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <Button size="sm" variant="outline" onClick={handleAdd} className="self-start">
          Comment
        </Button>
      </div>
    </div>
  )
}
