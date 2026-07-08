import type { AITool } from "@/lib/ai/types"
import type { DriveFile } from "@/lib/drive/types"

const MAX_RECURSION_DEPTH = 5

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
      description: "Search for files and folders by name within the Aspen Training Centre Workspace.",
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
      name: "list_drive_folder_contents",
      description: "List all files and folders inside a specific Drive folder. Returns names, types, sizes, and modified dates.",
      parameters: {
        type: "object",
        properties: {
          folderId: { type: "string", description: "The Drive folder ID to list contents of" },
        },
        required: ["folderId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_drive_folder",
      description: "Find a folder by name within the Aspen Training Centre Workspace, then recursively scan its contents and return a structured analysis with folder structure, file types, sizes, and insights.",
      parameters: {
        type: "object",
        properties: {
          folderName: { type: "string", description: "Name of the folder to analyze" },
        },
        required: ["folderName"],
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

async function listDriveFolderContents(
  args: Record<string, unknown>,
  _workspaceId: string,
  _userId: string
): Promise<string> {
  try {
    const { listFiles } = await import("@/lib/drive/actions")
    const folderId = (args.folderId as string) ?? "root"
    const result = await listFiles(folderId)

    if (result.files.length === 0) return "The folder is empty."

    const folders = result.files.filter((f) => f.fileType === "folder")
    const files = result.files.filter((f) => f.fileType !== "folder")

    const lines: string[] = []

    if (folders.length > 0) {
      lines.push("### Folders")
      for (const f of folders) {
        lines.push(`- **${f.name}** (id: \`${f.id}\`)`)
      }
    }

    if (files.length > 0) {
      lines.push("### Files")
      for (const f of files) {
        const size = f.size != null ? `${(f.size / 1024).toFixed(1)} KB` : "—"
        const date = f.modifiedTime
          ? new Date(f.modifiedTime).toLocaleDateString()
          : "—"
        lines.push(
          `- **${f.name}** | Type: ${f.mimeType} | Size: ${size} | Modified: ${date}`
        )
      }
    }

    lines.push(`\nTotal: ${folders.length} folder(s), ${files.length} file(s)`)
    return lines.join("\n")
  } catch (err) {
    return err instanceof Error ? err.message : "Failed to list folder contents"
  }
}

async function analyzeDriveFolder(
  args: Record<string, unknown>,
  _workspaceId: string,
  _userId: string
): Promise<string> {
  try {
    const { listFiles } = await import("@/lib/drive/actions")
    const rootId = (await import("@/lib/drive/config")).tryGetDriveRootFolderId()
    if (!rootId) return "Drive workspace folder is not configured."

    const folderName = (args.folderName as string)?.trim()
    if (!folderName) return "Please provide a folder name to analyze."

    const searchResult = await listFiles(rootId)

    const targetFolder = searchResult.files.find(
      (f) => f.fileType === "folder" && f.name.toLowerCase() === folderName.toLowerCase()
    )

    if (!targetFolder) {
      const similar = searchResult.files
        .filter((f) => f.fileType === "folder" && f.name.toLowerCase().includes(folderName.toLowerCase()))
        .map((f) => `"${f.name}" (id: \`${f.id}\`)`)

      if (similar.length > 0) {
        return `Folder "${folderName}" not found. Did you mean one of these?\n${similar.join("\n")}`
      }
      return `Folder "${folderName}" not found in the Aspen Workspace.`
    }

    const result = await recursiveScan(targetFolder.id, 0)
    const summary = buildFolderAnalysis(targetFolder.name, result)

    return summary
  } catch (err) {
    return err instanceof Error ? err.message : "Failed to analyze folder"
  }
}

type ScanResult = {
  files: { name: string; mimeType: string; size: number | null; modifiedTime: string; webViewLink: string }[]
  folders: { name: string; id: string; children: ScanResult }[]
  totalFiles: number
  totalFolders: number
  totalSize: number
  oldestFile: string | null
  newestFile: string | null
}

async function recursiveScan(
  folderId: string,
  depth: number
): Promise<ScanResult> {
  if (depth >= MAX_RECURSION_DEPTH) {
    return { files: [], folders: [], totalFiles: 0, totalFolders: 0, totalSize: 0, oldestFile: null, newestFile: null }
  }

  const { listFiles } = await import("@/lib/drive/actions")
  const result = await listFiles(folderId)

  const subfolders = result.files.filter((f) => f.fileType === "folder")
  const files = result.files.filter((f) => f.fileType !== "folder")

  const scanFiles = files.map((f) => ({
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
  }))

  const scannedFolders: ScanResult["folders"] = []

  let totalFiles = scanFiles.length
  let totalFolders = subfolders.length
  let totalSize = files.reduce((sum, f) => sum + (f.size ?? 0), 0)
  let oldestFile: string | null = null
  let newestFile: string | null = null

  for (const f of files) {
    if (!oldestFile || f.modifiedTime < oldestFile) oldestFile = f.modifiedTime
    if (!newestFile || f.modifiedTime > newestFile) newestFile = f.modifiedTime
  }

  for (const sub of subfolders) {
    const child = await recursiveScan(sub.id, depth + 1)
    scannedFolders.push({
      name: sub.name,
      id: sub.id,
      children: child,
    })
    totalFiles += child.totalFiles
    totalFolders += child.totalFolders
    totalSize += child.totalSize
    if (child.oldestFile && (!oldestFile || child.oldestFile < oldestFile)) oldestFile = child.oldestFile
    if (child.newestFile && (!newestFile || child.newestFile > newestFile)) newestFile = child.newestFile
  }

  return {
    files: scanFiles,
    folders: scannedFolders,
    totalFiles,
    totalFolders,
    totalSize,
    oldestFile,
    newestFile,
  }
}

function buildFolderAnalysis(folderName: string, scan: ScanResult): string {
  const lines: string[] = []

  lines.push(`## Folder Overview`)
  lines.push(``)
  lines.push(`**Folder**: ${folderName}`)
  lines.push(`**Total items**: ${scan.totalFiles} files, ${scan.totalFolders} sub-folders`)
  const totalSizeMB = (scan.totalSize / (1024 * 1024)).toFixed(1)
  lines.push(`**Total size**: ${totalSizeMB} MB`)

  if (scan.oldestFile && scan.newestFile) {
    lines.push(`**Date range**: ${new Date(scan.oldestFile).toLocaleDateString()} — ${new Date(scan.newestFile).toLocaleDateString()}`)
  }

  lines.push(``)
  lines.push(`## Structure`)
  lines.push(``)
  lines.push(buildTreeString(folderName, scan, 0))

  const byType: Record<string, number> = {}
  function countByType(scanned: ScanResult) {
    for (const f of scanned.files) {
      const ext = f.name.includes(".") ? f.name.split(".").pop()!.toUpperCase() : "NONE"
      byType[ext] = (byType[ext] ?? 0) + 1
    }
    for (const sub of scanned.folders) {
      countByType(sub.children)
    }
  }
  countByType(scan)

  if (Object.keys(byType).length > 0) {
    lines.push(``)
    lines.push(`## File Types`)
    lines.push(``)
    lines.push(`| Type | Count |`)
    lines.push(`| --- | --- |`)
    const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1])
    for (const [type, count] of sorted) {
      lines.push(`| ${type} | ${count} |`)
    }
  }

  if (scan.files.length > 0) {
    lines.push(``)
    lines.push(`## Key Files`)
    lines.push(``)
    const sorted = [...scan.files].sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(0, 10)
    lines.push(`| File | Size | Modified |`)
    lines.push(`| --- | --- | --- |`)
    for (const f of sorted) {
      const size = f.size != null ? `${(f.size / 1024).toFixed(0)} KB` : "—"
      const date = new Date(f.modifiedTime).toLocaleDateString()
      lines.push(`| ${f.name} | ${size} | ${date} |`)
    }
  }

  lines.push(``)
  lines.push(`## Insights`)
  lines.push(``)
  lines.push(`- **${scan.totalFiles}** files across **${scan.totalFolders}** sub-folders`)
  if (Object.keys(byType).length > 0) {
    const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]
    lines.push(`- Most common file type: **${topType[0]}** (${topType[1]} files)`)
  }
  if (scan.totalFolders > 0) {
    lines.push(`- Folder structure has **${scan.totalFolders}** sub-folders at up to **${MAX_RECURSION_DEPTH}** levels deep`)
  }

  return lines.join("\n")
}

function buildTreeString(name: string, scan: ScanResult, depth: number): string {
  const indent = "  ".repeat(depth)
  const lines: string[] = []
  const prefix = depth === 0 ? "📁" : "├──"
  lines.push(`${indent}${prefix} **${name}**/`)

  const allChildren: { name: string; isFolder: boolean }[] = [
    ...scan.folders.map((f) => ({ name: f.name, isFolder: true })),
    ...scan.files.map((f) => ({ name: f.name, isFolder: false })),
  ]

  for (const child of allChildren) {
    if (child.isFolder) {
      const folderData = scan.folders.find((f) => f.name === child.name)
      if (folderData) {
        const childStr = buildTreeString(child.name, folderData.children, depth + 1)
        lines.push(childStr)
      }
    } else {
      lines.push(`${indent}  ├── ${child.name}`)
    }
  }

  return lines.join("\n")
}

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  search_tasks: searchTasks,
  search_projects: searchProjects,
  search_people: searchPeople,
  search_drive: searchDrive,
  list_drive_folder_contents: listDriveFolderContents,
  analyze_drive_folder: analyzeDriveFolder,
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
