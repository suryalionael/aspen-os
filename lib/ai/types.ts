// Core message/tool types used by the OpenRouter integration and the UI panel.
export type AIMessage = {
  role: "user" | "assistant" | "tool" | "system"
  content: string
  tool_call_id?: string
  tool_calls?: AIToolCall[]
}

export type AIToolCall = {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export type AITool = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

// Legacy request shape kept for backward compatibility.
export type AIRequest = {
  messages: AIMessage[]
  workspaceId: string
  workspaceSlug: string
}

export type AIStreamChunkBase = {
  type: "text" | "tool_call" | "tool_result" | "error" | "done"
  content?: string
  tool_call?: AIToolCall
  tool_result?: {
    name: string
    result: string
  }
  conversationId?: string
}

export type OpenRouterRequest = {
  model: string
  messages: { role: string; content: string; tool_call_id?: string }[]
  tools?: AITool[]
  stream?: boolean
}

export type OpenRouterResponse = {
  id: string
  choices: {
    message: {
      role: string
      content: string | null
      tool_calls?: AIToolCall[]
    }
    finish_reason: string
  }[]
}

// ---------------------------------------------------------------------------
// Context Engine types
// ---------------------------------------------------------------------------

export type AspenRole = "owner" | "admin" | "member"

export type AspenPermission =
  | "view_workspace"
  | "view_all_tasks"
  | "manage_tasks"
  | "manage_projects"
  | "manage_members"
  | "manage_workspace"
  | "view_analytics"
  | "manage_drive"

export type AspenMember = {
  id: string
  email: string
  fullName: string
  role: AspenRole
}

export type AspenProjectRef = {
  id: string
  name: string
  status: string | null
  dueDate: string | null
  description: string | null
} | null

// The resolved personal + workspace context Aspen reasons over. This is the
// single source of truth for "who is the user", "what workspace", "what
// project is open", "what page", and "what can they do".
export type SelectedObject = {
  kind: "task" | "note" | "meeting" | "member" | "sprint"
  id: string
  title: string
}

export type UserContext = {
  user: {
    id: string
    email: string
    fullName: string
    role: AspenRole
  }
  permissions: AspenPermission[]
  workspace: {
    id: string
    name: string
    slug: string
  }
  members: AspenMember[]
  projects: { id: string; name: string }[]
  project: AspenProjectRef
  page: string | null
  selected: SelectedObject | null
}

export type Intent =
  | "task_query"
  | "project_query"
  | "sprint_query"
  | "calendar_query"
  | "member_query"
  | "workspace_analytics"
  | "planning"
  | "risk_analysis"
  | "status_report"
  | "search"
  | "action_request"
  | "brainstorm"
  | "general_chat"

export type IntentEntities = {
  scopeMe: boolean
  projectId: string | null
  projectName: string | null
  memberId: string | null
  memberName: string | null
  status: string | null
  dateToken: TemporalToken
  dateValue: string | null
  temporal: TemporalResult | null
  keywords: string[]
  selectedRef: "task" | "note" | "meeting" | "member" | "sprint" | null
}

export type IntentResult = {
  intent: Intent
  secondary: Intent[]
  confidence: number
  entities: IntentEntities
  reason: string
}

export type ContextSection = {
  title: string
  content: string
}

// The targeted, intent-specific data package. Never the whole database.
export type ContextPackage = {
  scope: string
  level: ContextLevel
  sections: ContextSection[]
  insights: PredictiveInsight[]
  limited: boolean
  missing: string[]
}

export type EngineResult = {
  userContext: UserContext
  intent: IntentResult
  contextPackage: ContextPackage
}

// Request accepted by the Context Engine / processAIRequest.
export type AspenRequest = {
  message: string
  workspaceId: string
  workspaceSlug: string
  conversationId?: string
  currentProjectId?: string | null
  currentPage?: string | null
  selectedTaskId?: string | null
  selectedNoteId?: string | null
  selectedMeetingId?: string | null
  selectedMemberId?: string | null
  selectedSprintId?: string | null
}

// Lightweight export kept for backwards compatibility with older callers.
export type AIContext = {
  recentTasks: string
  projects: string
  upcomingDeadlines: string
  workspaceMembers: string
}

// ---------------------------------------------------------------------------
// V2 — Agent-grade extensions
// ---------------------------------------------------------------------------

// Context budgets. Higher levels load more (and richer) context.
export type ContextLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6"

// Priority tiers used by the Context Priority Engine to rank information.
export type PriorityTier =
  | "overdue"
  | "due_today"
  | "blocked"
  | "high"
  | "in_progress"
  | "upcoming"
  | "other"

// Temporal expressions understood automatically by the Temporal Engine.
export type TemporalToken =
  | "today"
  | "tomorrow"
  | "yesterday"
  | "this_week"
  | "next_week"
  | "last_week"
  | "current_sprint"
  | "last_sprint"
  | "recent"
  | "upcoming"
  | "overdue"
  | "weekday"
  | "relative"
  | null

export type TemporalResult = {
  token: TemporalToken
  value: string | null
  rangeStart: string | null
  rangeEnd: string | null
  label: string
}

// Long-term, workspace-scoped memory (survives conversations).
export type WorkspaceMemoryEntry = {
  category: string
  key: string
  value: string
}

export type WorkspaceMemory = {
  sprintLengthDays: number | null
  workingHours: string | null
  timezone: string | null
  methodology: string | null
  definitionOfDone: string | null
  namingConvention: string | null
  codingStandards: string | null
  releaseCadence: string | null
  preferredPriorities: string | null
  custom: WorkspaceMemoryEntry[]
}

// Proactive, predictive insights surfaced by the Predictive Engine.
export type InsightSeverity = "critical" | "high" | "medium" | "low"

export type InsightCategory =
  | "overloaded_member"
  | "upcoming_overdue"
  | "project_at_risk"
  | "sprint_capacity"
  | "dependency_chain"
  | "inactive_task"
  | "missing_assignee"
  | "no_activity"
  | "stale_task"
  | "late_review"

export type PredictiveInsight = {
  id: string
  category: InsightCategory
  severity: InsightSeverity
  title: string
  detail: string
  evidence: string[]
  relatedTaskIds?: string[]
}

// Internal confidence estimate for every answer.
export type ConfidenceLevel = "high" | "medium" | "low"

export type ConfidenceResult = {
  level: ConfidenceLevel
  score: number
  reasons: string[]
}

// Action Planner — plan-first pipeline.
export type PlanStep = {
  order: number
  description: string
  tool?: string
}

export type ActionPlan = {
  intent: string
  summary: string
  steps: PlanStep[]
  requiredTools: string[]
  executeImmediately: boolean
}

// Disambiguation when multiple entities match a reference.
export type DisambiguationOption = {
  id: string
  label: string
  hint: string
}

export type Disambiguation = {
  kind: "member" | "project"
  query: string
  options: DisambiguationOption[]
}

// Proactive AI Home Dashboard payload.
export type HomeDashboard = {
  greeting: string
  health: "healthy" | "attention" | "at_risk"
  healthReason: string
  focus: { title: string; project: string; due: string | null; priority: string | null }[]
  risks: { level: InsightSeverity; description: string }[]
  actions: { id: string; label: string }[]
}

// Extended stream chunk types for V2 UI affordances.
export type AIStreamChunk =
  | {
      type: "text" | "tool_call" | "tool_result" | "error" | "done"
      content?: string
      tool_call?: AIToolCall
      tool_result?: { name: string; result: string }
      conversationId?: string
    }
  | {
      type: "disambiguation"
      disambiguation: Disambiguation
      conversationId?: string
    }
  | {
      type: "home"
      dashboard: HomeDashboard
      conversationId?: string
    }

