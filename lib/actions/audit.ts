"use server"

import { createClient } from "@/lib/supabase/server"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Workspace-wide superset of task_activity (DEC-021) — see migration 028
// for why a second table is needed: task_activity cascades away with its
// task (by design), and never covered non-task events (project rename,
// workspace rename, invitations, role changes) in the first place. Every
// mutation site that matters for the audit log calls this in addition to
// (not instead of) its existing task_activity/logActivity call.
export async function logAuditEvent(
  supabase: SupabaseServerClient,
  params: {
    workspaceId: string
    actorId: string
    action: string
    targetLabel?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  await supabase.from("audit_log").insert({
    workspace_id: params.workspaceId,
    actor_id: params.actorId,
    action: params.action,
    target_label: params.targetLabel ?? null,
    metadata: params.metadata ?? null,
  })
}

export type AuditLogEntry = {
  id: string
  actorId: string | null
  actorEmail: string | null
  action: string
  targetLabel: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export async function getAuditLog(
  workspaceId: string,
  filters?: { actorId?: string; action?: string; startDate?: string; endDate?: string }
): Promise<{ error: string } | { success: true; entries: AuditLogEntry[] }> {
  const supabase = await createClient()

  let query = supabase
    .from("audit_log")
    .select("id, actor_id, action, target_label, metadata, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200)

  if (filters?.actorId) query = query.eq("actor_id", filters.actorId)
  if (filters?.action) query = query.eq("action", filters.action)
  if (filters?.startDate) query = query.gte("created_at", filters.startDate)
  if (filters?.endDate) query = query.lte("created_at", `${filters.endDate}T23:59:59.999Z`)

  const { data, error } = await query

  if (error) {
    return { error: error.message }
  }

  const { data: members } = await supabase.rpc("get_workspace_members_with_email", {
    p_workspace_id: workspaceId,
  })
  const emailByUserId = new Map<string, string>(
    (members ?? []).map((member: { user_id: string; email: string }) => [
      member.user_id,
      member.email,
    ])
  )

  const entries: AuditLogEntry[] = (data ?? []).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_id ? emailByUserId.get(row.actor_id) ?? null : null,
    action: row.action,
    targetLabel: row.target_label,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.created_at,
  }))

  return { success: true, entries }
}

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function exportAuditLogCsv(
  workspaceId: string
): Promise<{ error: string } | { success: true; csv: string }> {
  const result = await getAuditLog(workspaceId)
  if ("error" in result) return result

  const header = ["created_at", "actor_email", "action", "target_label"]
  const lines = [header.join(",")]
  for (const entry of result.entries) {
    lines.push(
      [entry.createdAt, entry.actorEmail ?? "", entry.action, entry.targetLabel ?? ""]
        .map((value) => escapeCsvCell(String(value)))
        .join(",")
    )
  }

  return { success: true, csv: lines.join("\n") }
}
