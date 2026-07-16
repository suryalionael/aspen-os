import { createClient } from "@/lib/supabase/server"

import { classifyIntent } from "@/lib/ai/intents"
import { buildContextPackage } from "@/lib/ai/context-builder"
import { resolveUserContext } from "@/lib/ai/user-context"
import type {
  AspenRequest,
  EngineResult,
  UserContext,
} from "@/lib/ai/types"

/**
 * The Context Engine. Single entry point that wires the four reasoning layers
 * together for one request:
 *
 *   AI Request → resolveUserContext → classifyIntent → buildContextPackage
 *
 * It returns an EngineResult (user context + intent + context package) that the
 * orchestrator in actions.ts feeds into the Prompt Builder and the LLM.
 */
export async function runContextEngine(
  request: AspenRequest
): Promise<EngineResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const userContext: UserContext = await resolveUserContext(
    request.workspaceId,
    user.id,
    {
      projectId: request.currentProjectId,
      page: request.currentPage,
      selectedTaskId: request.selectedTaskId,
      selectedNoteId: request.selectedNoteId,
      selectedMeetingId: request.selectedMeetingId,
      selectedMemberId: request.selectedMemberId,
      selectedSprintId: request.selectedSprintId,
    }
  )

  const intent = classifyIntent(request.message, userContext)
  const contextPackage = await buildContextPackage(intent, userContext, request.message)

  return { userContext, intent, contextPackage }
}

export type ContextEngine = {
  resolve: (request: AspenRequest) => Promise<EngineResult>
}

export function createContextEngine(): ContextEngine {
  return { resolve: runContextEngine }
}

// ---------------------------------------------------------------------------
// Backwards-compatible export. Returns a plain-text context snapshot.
// New callers should use createContextEngine() / runContextEngine().
// ---------------------------------------------------------------------------
export async function buildContext(
  workspaceId: string,
  userId: string
): Promise<string> {
  try {
    const userContext = await resolveUserContext(workspaceId, userId)
    const projects = userContext.projects.map((p) => p.name).join(", ") || "none"
    const members = userContext.members.map((m) => m.email).join(", ") || "none"
    return [
      `Workspace: ${userContext.workspace.name}`,
      `Projects: ${projects}`,
      `Members: ${members}`,
      `User: ${userContext.user.fullName} (${userContext.user.role})`,
    ].join("\n")
  } catch {
    return ""
  }
}
