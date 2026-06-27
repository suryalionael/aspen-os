"use client"

import { useEffect, useState } from "react"

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
}

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
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [actorFilter, setActorFilter] = useState("")
  const [actionFilter, setActionFilter] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  async function refresh() {
    setLoading(true)
    const result = await getAuditLog(workspaceId, {
      actorId: actorFilter || undefined,
      action: actionFilter || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })
    setEntries("success" in result ? result.entries : [])
    setLoading(false)
  }

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
      setEntries("success" in logResult ? logResult.entries : [])
      setMembers("success" in membersResult ? membersResult.members : [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [open, workspaceId])

  function handleFilter() {
    refresh()
  }

  function handleExportCsv() {
    exportAuditLogCsv(workspaceId).then((result) => {
      if ("success" in result) {
        downloadFile(result.csv, "audit-log.csv", "text/csv")
      }
    })
  }

  const knownActions = Array.from(new Set(entries.map((entry) => entry.action)))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Audit log
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
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
              {knownActions.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action] ?? action}
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

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {entries.map((entry) => (
              <li key={entry.id} data-testid="audit-log-entry" className="border-b border-border pb-1.5">
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
                <span className="text-muted-foreground">
                  {" "}
                  · {new Date(entry.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
