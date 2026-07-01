"use client"

import React, { useEffect, useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import {
  addComment,
  deleteComment,
  editComment,
  getComments,
  type Comment,
} from "@/lib/actions/comments"

// How long a comment ID counts as "just written by this session" — see
// the identical rationale in kanban-board.tsx (DEC-023).
const SELF_ECHO_WINDOW_MS = 4000

const MENTION_RE = /(@[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,})/g

function renderMentions(text: string): React.ReactNode {
  const parts = text.split(MENTION_RE)
  return parts.map((part, index) =>
    /^@[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(part) ? (
      <span key={index} className="font-medium text-primary">
        {part}
      </span>
    ) : (
      part
    )
  )
}

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
  const [newCommentBanner, setNewCommentBanner] = useState(false)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recentlyTouched = useRef<Map<string, number>>(new Map())
  // Lets the Realtime handler below read the latest comments without
  // calling onChanged from inside a setState updater — doing that
  // triggered React's "Cannot update a component while rendering a
  // different component" warning, since onChanged ultimately updates
  // KanbanBoard's state, not just this component's own.
  const commentsRef = useRef<Comment[]>([])
  useEffect(() => {
    commentsRef.current = comments
  }, [comments])

  function markTouched(commentId: string) {
    recentlyTouched.current.set(commentId, Date.now())
  }

  function wasRecentlyTouched(commentId: string) {
    const touchedAt = recentlyTouched.current.get(commentId)
    return Boolean(touchedAt) && Date.now() - touchedAt! < SELF_ECHO_WINDOW_MS
  }

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

  // DEC-023: live comments via Realtime, scoped to this one task. Shown
  // as an inline banner rather than a viewport-fixed toast (used on the
  // board) since this renders inside an already-modal dialog, where a
  // fixed-position element risks landing behind the dialog's own overlay
  // depending on stacking context — an inline banner has no such risk.
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    // Per Supabase's docs (Postgres Changes guide, "Custom tokens"): the
    // auth token must be set on the Realtime client before connecting to
    // a channel, not after — confirmed directly in kanban-board.tsx (the
    // same fix), where omitting this left the channel SUBSCRIBED but
    // silently receiving zero events, with no error.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data.session) {
        supabase.realtime.setAuth(data.session.access_token)
      }
      channel = buildChannel()
    })

    function buildChannel() {
      return supabase
        .channel(`comments-${taskId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "comments",
            filter: `task_id=eq.${taskId}`,
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Comment
              if (wasRecentlyTouched(row.id)) return
              if (commentsRef.current.some((comment) => comment.id === row.id)) return
              const next = [...commentsRef.current, row]
              setComments(next)
              onChanged(next.length)
              setNewCommentBanner(true)
              setTimeout(() => setNewCommentBanner(false), 4000)
              return
            }

            if (payload.eventType === "UPDATE") {
              const row = payload.new as Comment
              setComments((previous) =>
                previous.map((comment) => (comment.id === row.id ? row : comment))
              )
              return
            }

            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as { id: string }
              const next = commentsRef.current.filter((comment) => comment.id !== oldRow.id)
              if (next.length !== commentsRef.current.length) {
                setComments(next)
                onChanged(next.length)
              }
            }
          }
        )
        .subscribe()
    }

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      markTouched(result.comment.id)
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
    setError(null)
    startTransition(async () => {
      const result = await editComment(id, content)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setComments((previous) =>
        previous.map((comment) => (comment.id === id ? result.comment : comment))
      )
      setEditingId(null)
    })
  }

  function handleDelete(comment: Comment) {
    setError(null)
    markTouched(comment.id)
    const previous = comments
    const next = comments.filter((existing) => existing.id !== comment.id)
    setComments(next)
    startTransition(async () => {
      const result = await deleteComment(comment.id)
      if ("error" in result) {
        setError(result.error)
        setComments(previous)
        return
      }
      onChanged(next.length)
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading comments…</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {newCommentBanner && (
        <p
          role="status"
          className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary"
        >
          New comment
        </p>
      )}
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
                  <p className="whitespace-pre-wrap text-sm">{renderMentions(comment.content)}</p>
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
