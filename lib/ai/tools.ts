import type { AITool } from "@/lib/ai/types"

export const AI_TOOLS: AITool[] = [
  {
    type: "function",
    function: {
      name: "search_tasks",
      description: "Search for tasks across projects. Returns matching task titles, statuses, and project names.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for task title" },
          status: {
            type: "string",
            enum: ["backlog", "todo", "in_progress", "done"],
            description: "Filter by status",
          },
          limit: { type: "number", description: "Max results (default 10)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_projects",
      description: "Search for projects by name or status.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          status: {
            type: "string",
            enum: ["active", "on_hold", "completed"],
            description: "Filter by status",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_people",
      description: "Search workspace members by email or name.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Email or name to search" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_drive",
      description: "Search Google Drive files by name.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "File name to search for" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overdue_tasks",
      description: "Get all overdue tasks (past due date, not done).",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_task_summary",
      description: "Summarize all tasks grouped by project with counts per status.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_tasks",
      description: "Get tasks assigned to the current user.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["backlog", "todo", "in_progress", "done"],
            description: "Filter by status",
          },
        },
        required: [],
      },
    },
  },
]

export type ToolHandler = (
  args: Record<string, unknown>,
  workspaceId: string,
  userId: string
) => Promise<string>

async function searchTasks(
  args: Record<string, unknown>,
  workspaceId: string,
  _userId: string
): Promise<string> {
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)

  const projectIds = (projects ?? []).map((p) => p.id)
  const projectNames = new Map((projects ?? []).map((p) => [p.id, p.name]))

  if (projectIds.length === 0) return "No projects found"

  let query = supabase
    .from("tasks")
    .select("id, title, status, project_id, due_date, priority, assignee_id")
    .in("project_id", projectIds)
    .is("archived_at", null)

  const searchQuery = args.query as string | undefined
  if (searchQuery) {
    query = query.ilike("title", `%${searchQuery}%`)
  }
  const statusFilter = args.status as string | undefined
  if (statusFilter) {
    query = query.eq("status", statusFilter)
  }
  const limit = (args.limit as number) ?? 10
  query = query.limit(limit)

  const { data: tasks } = await query

  if (!tasks || tasks.length === 0) return "No tasks found"

  return tasks
    .map(
      (t) =>
        `- "${t.title}" (${t.status}) [${projectNames.get(t.project_id) ?? "Unknown"}]` +
        (t.due_date ? ` due: ${t.due_date}` : "") +
        (t.priority ? ` priority: ${t.priority}` : "")
    )
    .join("\n")
}

async function searchProjects(
  args: Record<string, unknown>,
  workspaceId: string,
  _userId: string
): Promise<string> {
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()

  let query = supabase
    .from("projects")
    .select("id, name, status, description")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)

  const searchQuery = args.query as string | undefined
  if (searchQuery) {
    query = query.ilike("name", `%${searchQuery}%`)
  }
  const statusFilter = args.status as string | undefined
  if (statusFilter) {
    query = query.eq("status", statusFilter)
  }

  const { data: projects } = await query.limit(10)

  if (!projects || projects.length === 0) return "No projects found"

  return projects
    .map((p) => `- "${p.name}" (${p.status})${p.description ? `: ${p.description}` : ""}`)
    .join("\n")
}

async function searchPeople(
  args: Record<string, unknown>,
  workspaceId: string,
  _userId: string
): Promise<string> {
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()

  const { data: members } = await supabase.rpc("get_workspace_members_with_email", {
    p_workspace_id: workspaceId,
  })

  const query = (args.query as string)?.toLowerCase() ?? ""

  const filtered = (members as { user_id: string; email: string }[] ?? []).filter(
    (m) => m.email.toLowerCase().includes(query)
  )

  if (filtered.length === 0) return "No matching team members"

  return filtered.map((m) => `- ${m.email}`).join("\n")
}

async function searchDrive(
  args: Record<string, unknown>,
  _workspaceId: string,
  _userId: string
): Promise<string> {
  try {
    const { searchFiles } = await import("@/lib/drive/actions")
    const query = (args.query as string) ?? ""
    const result = await searchFiles(query, { pageSize: 10 })

    if (result.files.length === 0) return "No matching Drive files found"

    return result.files
      .map(
        (f) =>
          `- "${f.name}" (${f.fileType})${f.owners[0] ? ` by ${f.owners[0].email}` : ""}`
      )
      .join("\n")
  } catch {
    return "Drive search unavailable. Connect Google account to use this feature."
  }
}

async function getOverdueTasks(
  _args: Record<string, unknown>,
  workspaceId: string,
  _userId: string
): Promise<string> {
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)

  const projectIds = (projects ?? []).map((p) => p.id)
  const projectNames = new Map((projects ?? []).map((p) => [p.id, p.name]))

  if (projectIds.length === 0) return "No projects"

  const today = new Date().toISOString().split("T")[0]

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, project_id, due_date, priority")
    .in("project_id", projectIds)
    .neq("status", "done")
    .lt("due_date", today)
    .is("archived_at", null)
    .order("due_date", { ascending: true })
    .limit(20)

  if (!tasks || tasks.length === 0) return "No overdue tasks"

  return tasks
    .map(
      (t) =>
        `- "${t.title}" [${projectNames.get(t.project_id) ?? "Unknown"}] (due: ${t.due_date})` +
        (t.priority ? ` priority: ${t.priority}` : "")
    )
    .join("\n")
}

async function getTaskSummary(
  _args: Record<string, unknown>,
  workspaceId: string,
  _userId: string
): Promise<string> {
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)

  const projectIds = (projects ?? []).map((p) => p.id)

  if (projectIds.length === 0) return "No projects"

  const { data: tasks } = await supabase
    .from("tasks")
    .select("project_id, status")
    .in("project_id", projectIds)
    .is("archived_at", null)

  if (!tasks || tasks.length === 0) return "No tasks"

  const projectNames = new Map((projects ?? []).map((p) => [p.id, p.name]))
  const byProject: Record<string, Record<string, number>> = {}

  for (const t of tasks) {
    const name = projectNames.get(t.project_id) ?? "Unknown"
    if (!byProject[name]) byProject[name] = {}
    byProject[name][t.status] = (byProject[name][t.status] ?? 0) + 1
  }

  const lines: string[] = []
  for (const [project, counts] of Object.entries(byProject)) {
    const parts = Object.entries(counts).map(([s, c]) => `${s}: ${c}`)
    lines.push(`- ${project}: ${parts.join(", ")}`)
  }

  return lines.join("\n")
}

async function getUserTasks(
  args: Record<string, unknown>,
  workspaceId: string,
  userId: string
): Promise<string> {
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)

  const projectIds = (projects ?? []).map((p) => p.id)
  const projectNames = new Map((projects ?? []).map((p) => [p.id, p.name]))

  if (projectIds.length === 0) return "No projects"

  let query = supabase
    .from("tasks")
    .select("id, title, status, project_id, due_date, priority")
    .in("project_id", projectIds)
    .eq("assignee_id", userId)
    .is("archived_at", null)

  const statusFilter = args.status as string | undefined
  if (statusFilter) query = query.eq("status", statusFilter)

  const { data: tasks } = await query.limit(20)

  if (!tasks || tasks.length === 0) return "No tasks assigned to you"

  return tasks
    .map(
      (t) =>
        `- "${t.title}" (${t.status}) [${projectNames.get(t.project_id) ?? "Unknown"}]` +
        (t.due_date ? ` due: ${t.due_date}` : "") +
        (t.priority ? ` priority: ${t.priority}` : "")
    )
    .join("\n")
}

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  search_tasks: searchTasks,
  search_projects: searchProjects,
  search_people: searchPeople,
  search_drive: searchDrive,
  get_overdue_tasks: getOverdueTasks,
  get_task_summary: getTaskSummary,
  get_user_tasks: getUserTasks,
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  workspaceId: string,
  userId: string
): Promise<string> {
  const handler = TOOL_HANDLERS[name]
  if (!handler) return `Unknown tool: ${name}`
  return handler(args, workspaceId, userId)
}
