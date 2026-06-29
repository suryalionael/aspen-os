const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  due_date: "Due date",
  priority: "Priority",
  assignee_id: "Assignee",
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}

function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "(none)"
  if (field === "priority") return PRIORITY_LABELS[String(value)] ?? String(value)
  if (field === "assignee_id") return "(someone)"
  if (field === "description") {
    const text = String(value)
    return text.length > 40 ? `${text.slice(0, 40)}…` : text
  }
  return String(value)
}

const ACTIVITY_LABELS: Record<string, (metadata: Record<string, unknown> | null) => string> = {
  created: () => "Task created",
  moved: (metadata) => `Moved to ${String(metadata?.to ?? "another column")}`,
  edited: (metadata) => {
    const field = String(metadata?.field ?? "")
    const label = FIELD_LABELS[field] ?? "Task"
    return `${label} changed to ${formatFieldValue(field, metadata?.to)}`
  },
  archived: () => "Task archived",
  unarchived: () => "Task restored from archive",
  label_added: (metadata) => `Label "${String(metadata?.label_name ?? "")}" added`,
  label_removed: (metadata) => `Label "${String(metadata?.label_name ?? "")}" removed`,
  checklist_item_added: (metadata) =>
    `Checklist item "${String(metadata?.content ?? "")}" added`,
  checklist_item_completed: (metadata) =>
    `Checked off "${String(metadata?.content ?? "")}"`,
  checklist_item_reopened: (metadata) =>
    `Unchecked "${String(metadata?.content ?? "")}"`,
  checklist_item_removed: (metadata) =>
    `Checklist item "${String(metadata?.content ?? "")}" removed`,
  commented: () => "New comment",
  attachment_added: (metadata) => `Attachment "${String(metadata?.file_name ?? "")}" added`,
  attachment_removed: (metadata) =>
    `Attachment "${String(metadata?.file_name ?? "")}" removed`,
  assignee_added: (metadata) => `Assigned to ${String(metadata?.email ?? "someone")}`,
  assignee_removed: (metadata) => `Unassigned from ${String(metadata?.email ?? "someone")}`,
}

export function describeActivity(
  eventType: string,
  metadata: Record<string, unknown> | null
): string {
  const describe = ACTIVITY_LABELS[eventType]
  return describe ? describe(metadata) : eventType
}
