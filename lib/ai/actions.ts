"use server"

import { createClient } from "@/lib/supabase/server"
import { createContextEngine } from "@/lib/ai/context"
import { buildWorkspaceGraph, graphTasksForUser } from "@/lib/ai/graph"
import { sortTasksByPriority } from "@/lib/ai/priority"
import { streamAIRequest } from "@/lib/ai/engine"
import { SUPPORTED_MODELS } from "@/lib/ai/config"
import type { AIStreamChunk, AspenRequest, HomeDashboard } from "@/lib/ai/types"

/**
 * Server Action entry point (legacy contract). Collects the chunks produced by
 * the shared orchestration generator (`streamAIRequest`) into a single array.
 *
 * New callers that want incremental output should call the `/api/ai/ask`
 * SSE route instead, which yields the same chunks as they are produced.
 */
export async function processAIRequest(
  request: AspenRequest
): Promise<AIStreamChunk[]> {
  const chunks: AIStreamChunk[] = []
  for await (const chunk of streamAIRequest(request)) {
    chunks.push(chunk)
  }
  return chunks
}

// ---------------------------------------------------------------------------
// AI Home Dashboard (L0) — proactive greeting with value before asking
// ---------------------------------------------------------------------------

export async function getAspenHomeDashboard(
  request: Pick<AspenRequest, "workspaceId" | "workspaceSlug" | "currentProjectId" | "currentPage">
): Promise<HomeDashboard> {
  const engine = createContextEngine()
  const result = await engine.resolve({ ...request, message: "home dashboard" })
  const ctx = result.userContext
  const graph = await buildWorkspaceGraph(await createClient(), ctx, {
    projectId: request.currentProjectId,
  })
  const insights = result.contextPackage.insights

  const hour = new Date().getHours()
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"
  const firstName = ctx.user.fullName.split(" ")[0]

  const critical = insights.find((i) => i.severity === "critical")
  const high = insights.find((i) => i.severity === "high")
  const health: HomeDashboard["health"] = critical
    ? "at_risk"
    : high
    ? "attention"
    : "healthy"
  const healthReason = critical?.title ?? high?.title ?? "No major risks detected."

  const myTasks = graphTasksForUser(graph, ctx.user.id)
  const focus = sortTasksByPriority(myTasks)
    .slice(0, 4)
    .map((t) => ({
      title: t.title,
      project: t.project_name,
      due: t.due_date,
      priority: t.priority,
    }))

  const risks = insights.slice(0, 3).map((i) => ({ level: i.severity, description: i.title }))

  const actions: HomeDashboard["actions"] = [
    { id: "open_sprint", label: "Open Sprint" },
    { id: "reassign", label: "Reassign Tasks" },
    { id: "standup", label: "Generate Standup" },
  ]

  return {
    greeting: `Good ${part}, ${firstName}.`,
    health,
    healthReason,
    focus,
    risks,
    actions,
  }
}

export async function getAspenAIModels(): Promise<string[]> {
  return ["deepseek/deepseek-chat", "qwen/qwen2.5-72b-instruct", "kimi/kimi-vl-2025"]
}
