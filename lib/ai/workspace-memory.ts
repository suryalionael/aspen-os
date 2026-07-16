import { createClient } from "@/lib/supabase/server"
import type { UserContext, WorkspaceMemory, WorkspaceMemoryEntry } from "@/lib/ai/types"

const DEFAULTS: WorkspaceMemory = {
  sprintLengthDays: null,
  workingHours: null,
  timezone: null,
  methodology: null,
  definitionOfDone: null,
  namingConvention: null,
  codingStandards: null,
  releaseCadence: null,
  preferredPriorities: null,
  custom: [],
}

function categorize(key: string): string {
  const k = key.toLowerCase()
  if (k.includes("sprint")) return "sprint_length"
  if (k.includes("working") || k.includes("hours")) return "working_hours"
  if (k.includes("timezone") || k.includes("tz")) return "timezone"
  if (k.includes("methodolog") || k.includes("framework") || k.includes("agile") || k.includes("scrum")) return "methodology"
  if (k.includes("definition_of_done") || k.includes("dod")) return "definition_of_done"
  if (k.includes("naming")) return "naming_convention"
  if (k.includes("coding") || k.includes("standard") || k.includes("lint")) return "coding_standards"
  if (k.includes("release") || k.includes("cadence")) return "release_cadence"
  if (k.includes("priority")) return "preferred_priorities"
  return "custom"
}

/**
 * Loads long-term, workspace-scoped memory that survives conversations.
 * This is what lets Aspen reason like a teammate who "has been here for
 * months": it knows the sprint length, working hours, timezone, methodology,
 * definition of done, naming conventions, coding standards, release cadence,
 * and preferred priorities without being told each time.
 */
export async function loadWorkspaceMemory(workspaceId: string): Promise<WorkspaceMemory> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("aspen_workspace_memory")
      .select("category, key, value")
      .eq("workspace_id", workspaceId)

    const mem: WorkspaceMemory = { ...DEFAULTS }
    for (const row of data ?? []) {
      const entry: WorkspaceMemoryEntry = { category: row.category, key: row.key, value: row.value }
      switch (row.category) {
        case "sprint_length": mem.sprintLengthDays = Number(row.value) || null; break
        case "working_hours": mem.workingHours = row.value; break
        case "timezone": mem.timezone = row.value; break
        case "methodology": mem.methodology = row.value; break
        case "definition_of_done": mem.definitionOfDone = row.value; break
        case "naming_convention": mem.namingConvention = row.value; break
        case "coding_standards": mem.codingStandards = row.value; break
        case "release_cadence": mem.releaseCadence = row.value; break
        case "preferred_priorities": mem.preferredPriorities = row.value; break
        default: mem.custom.push(entry)
      }
    }
    return mem
  } catch {
    return { ...DEFAULTS }
  }
}

export async function saveWorkspaceMemory(
  workspaceId: string,
  key: string,
  value: string,
  userId?: string
): Promise<void> {
  const supabase = await createClient()
  const category = categorize(key)
  const { data: { session } } = await supabase.auth.getSession()
  const createdBy = userId ?? session?.user?.id ?? null

  await supabase.from("aspen_workspace_memory").upsert(
    {
      workspace_id: workspaceId,
      category,
      key,
      value,
      created_by: createdBy,
    },
    { onConflict: "workspace_id, key" }
  )
}

/**
 * Renders the workspace memory as a compact context block for the prompt.
 * Sensible defaults are shown inline when a value is not yet set, so the
 * assistant can suggest them proactively.
 */
export function memoryToPrompt(mem: WorkspaceMemory): string {
  const lines: string[] = []
  const add = (label: string, value: string | null, fallback: string) => {
    lines.push(`- ${label}: ${value ?? `_${fallback}_`}`)
  }
  add("Sprint length", mem.sprintLengthDays ? `${mem.sprintLengthDays} days` : null, "not set")
  add("Working hours", mem.workingHours, "not set")
  add("Timezone", mem.timezone, "workspace default")
  add("Methodology", mem.methodology, "not set")
  add("Definition of Done", mem.definitionOfDone, "not set")
  add("Naming conventions", mem.namingConvention, "not set")
  add("Coding standards", mem.codingStandards, "not set")
  add("Release cadence", mem.releaseCadence, "not set")
  add("Preferred priorities", mem.preferredPriorities, "not set")
  for (const c of mem.custom) {
    lines.push(`- ${c.key}: ${c.value}`)
  }
  return lines.join("\n")
}

export function hasWorkspaceMemory(mem: WorkspaceMemory): boolean {
  return (
    mem.sprintLengthDays !== null ||
    !!mem.workingHours ||
    !!mem.timezone ||
    !!mem.methodology ||
    !!mem.definitionOfDone ||
    !!mem.namingConvention ||
    !!mem.codingStandards ||
    !!mem.releaseCadence ||
    !!mem.preferredPriorities ||
    mem.custom.length > 0
  )
}
