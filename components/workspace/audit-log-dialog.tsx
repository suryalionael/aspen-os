"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

import {
  exportAuditLogCsv,
  getAuditLog,
  type AuditLogEntry,
} from "@/lib/actions/audit"
import { getWorkspaceMembers, type WorkspaceMember } from "@/lib/actions/workspaces"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

const ACTION_LABELS: Record<string, string> = {
  "task.created": "Task created",
  "task.edited": "Task edited",
  "task.moved": "Task moved",
  "task.archived": "Task archived",
  "task.unarchived": "Task restored",
  "task.deleted": "Task deleted",
  "task.commented": "Task commented",
  "task.checklist_updated": "Checklist updated",
  "task.attachment_added": "Attachment added",
  "task.attachment_removed": "Attachment removed",
  "invitation.created": "Invitation created",
  "invitation.revoked": "Invitation revoked",
  "invitation.accepted": "Invitation accepted",
  "member.role_changed": "Role changed",
  "member.removed": "Member removed",
  "member.left": "Member left",
  "project.renamed": "Project renamed",
  "project.archived": "Project archived",
  "project.unarchived": "Project restored",
  "project.deleted": "Project deleted",
  "workspace.renamed": "Workspace renamed",
  "workspace.updated": "Workspace updated",
  "workspace.archived": "Workspace archived",
  "workspace.unarchived": "Workspace restored",
  "meeting.created": "Meeting created",
  "meeting.deleted": "Meeting deleted",
  "note.announcement_posted": "Announcement posted",
}

// The full, static set — not derived from whatever happens to be on the
// currently-loaded page, which would make the filter's own options shift
// unpredictably as more pages load.
const ALL_ACTIONS = Object.keys(ACTION_LABELS)

const ROW_HEIGHT_PX = 56

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function AuditLogDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [actorFilter, setActorFilter] = useState("")
  const [actionFilter, setActionFilter] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [exportError, setExportError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const activeFilters = {
    actorId: actorFilter || undefined,
    action: actionFilter || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  }

  async function refresh() {
    setLoading(true)
    const result = await getAuditLog(workspaceId, activeFilters)
    if ("success" in result) {
      setEntries(result.entries)
      setHasMore(result.hasMore)
    } else {
      setEntries([])
      setHasMore(false)
    }
    setLoading(false)
  }

  const loadMore = useCallback(() => {
    setLoadingMore(true)
    const last = entries[entries.length - 1]
    getAuditLog(workspaceId, {
      ...activeFilters,
      cursor: last ? { createdAt: last.createdAt, id: last.id } : undefined,
    }).then((result) => {
      if ("success" in result) {
        setEntries((previous) => [...previous, ...result.entries])
        setHasMore(result.hasMore)
      }
      setLoadingMore(false)
    })
    // activeFilters is a fresh object every render — only `entries` (for
    // the cursor) and workspaceId actually need to trigger a new callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, workspaceId])

  useEffect(() => {
    if (!open) return
    // Guards against React StrictMode's double-invoked effects in
    // development — see the same fix in TaskChecklist/TaskLabelPicker.
    let active = true
    Promise.all([
      getAuditLog(workspaceId, {}),
      getWorkspaceMembers(workspaceId),
    ]).then(([logResult, membersResult]) => {
      if (!active) return
      if ("success" in logResult) {
        setEntries(logResult.entries)
        setHasMore(logResult.hasMore)
      }
      setMembers("success" in membersResult ? membersResult.members : [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [open, workspaceId])

  // Infinite scroll: a sentinel at the bottom of the list triggers
  // loading the next page once it scrolls into view, rather than a
  // "Load more" button.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loadingMore) {
        loadMore()
      }
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadMore])

  function handleFilter() {
    refresh()
  }

  function handleExportCsv() {
    setExportError(null)
    exportAuditLogCsv(workspaceId).then((result) => {
      if ("error" in result) {
        setExportError(result.error)
        return
      }
      downloadFile(result.csv, "audit-log.csv", "text/csv")
    })
  }

  // Virtualized — this list can grow indefinitely as a workspace
  // accumulates history, and (unlike the Kanban board's cards) has no
  // drag-and-drop to entangle with a virtualizer.
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Audit log
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Audit log</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-actor" className="text-xs font-medium text-muted-foreground">
              User
            </label>
            <select
              id="audit-actor"
              value={actorFilter}
              onChange={(event) => setActorFilter(event.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">Anyone</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-action" className="text-xs font-medium text-muted-foreground">
              Action
            </label>
            <select
              id="audit-action"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">Any action</option>
              {ALL_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-start" className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <Input
              id="audit-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-8 w-32 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-end" className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <Input
              id="audit-end"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-8 w-32 text-sm"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleFilter}>
            Filter
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportCsv}>
            Export CSV
          </Button>
        </div>

        {exportError && (
          <p role="alert" className="text-sm text-destructive">
            {exportError}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet</p>
        ) : (
          <div ref={scrollRef} className="max-h-96 overflow-y-auto">
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const entry = entries[virtualRow.index]
                return (
                  <div
                    key={entry.id}
                    data-testid="audit-log-entry"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex flex-col justify-center border-b border-border text-sm"
                  >
                    <div>
                      <span className="font-medium">{entry.actorEmail ?? "Someone"}</span>{" "}
                      <span className="text-muted-foreground">
                        {(ACTION_LABELS[entry.action] ?? entry.action).toLowerCase()}
                      </span>
                      {entry.targetLabel && (
                        <>
                          {" "}
                          <span className="font-medium">&quot;{entry.targetLabel}&quot;</span>
                        </>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                )
              })}
            </div>
            <div ref={sentinelRef} />
            {loadingMore && (
              <p className="py-1 text-center text-xs text-muted-foreground">Loading more…</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
