import { createClient } from "@/lib/supabase/server"

import { getOpenRouterConfig, OPENROUTER_BASE_URL } from "@/lib/ai/config"
import { createContextEngine } from "@/lib/ai/context"
import { buildSystemPrompt, buildUserMessage } from "@/lib/ai/prompt"
import { responseGuidanceFor, postProcessResponse } from "@/lib/ai/response"
import { AI_TOOLS, executeTool } from "@/lib/ai/tools"
import { getMessages, saveMessage, saveMemory, listConversations, createConversation } from "@/lib/ai/memory"
import { loadWorkspaceMemory, memoryToPrompt } from "@/lib/ai/workspace-memory"
import { buildPlan, planToPrompt } from "@/lib/ai/planner"
import { estimateConfidence } from "@/lib/ai/confidence"
import { routeFastPath, executeFastPath } from "@/lib/ai/fast-path"
import {
  isPersonalMemoryCommand,
  observePreferences,
  savePersonalMemory,
  deletePersonalMemory,
  loadLongTermMemorySection,
  parseRememberContent,
} from "@/lib/ai/personal-memory"
import type {
  AIToolCall,
  AIStreamChunk,
  AspenRequest,
  Disambiguation,
  OpenRouterRequest,
  UserContext,
} from "@/lib/ai/types"

const MEMORY_GUIDANCE = `## Memory
- You can persist facts with the **save_memory** tool (type: fact, deadline, preference, note, decision, project_context, instruction).
- When the user shares a decision, deadline, or important instruction, point it out and offer to save it. Do not save automatically without confirmation unless the user explicitly says "remember …".
- Previous memories and this conversation are already in context — do not re-save what you already know.
- You may also record durable workspace facts (sprint length, working hours, methodology, definition of done, etc.) using save_workspace_memory so future sessions remember them.`

/**
 * Core orchestration for one Aspen AI turn, exposed as an async generator
 * so a Server Action can collect the chunks into an array (legacy contract)
 * AND a streaming SSE route can yield them incrementally.
 *
 * Pipeline: Context Engine → Intent → Memory → Planner → Confidence →
 * Prompt → LLM + tools loop → stream chunks.
 */
export async function* streamAIRequest(
  request: AspenRequest
): AsyncGenerator<AIStreamChunk> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    yield { type: "error", content: "Not authenticated" }
    return
  }

  try {
    const { apiKey, model } = getOpenRouterConfig()
    const engine = createContextEngine()
    const result = await engine.resolve(request)

    // Fast Path — deterministic, LLM-free answers. Runs before any
    // prompt build / plan / LLM call so high-frequency asks return
    // in <300ms and never consume token budget.
    const fastKind = routeFastPath(
      request.message,
      result.intent.intent,
      result.intent.entities
    )
    if (fastKind) {
      let conversationId = request.conversationId
      if (!conversationId) {
        const existing = await listConversations(request.workspaceId)
        conversationId =
          existing[0]?.id ??
          (await createConversation(request.workspaceId, request.message.slice(0, 60))).id
      }
      const markdown = await executeFastPath(fastKind, result.userContext, {
        workspaceId: request.workspaceId,
        projectId: result.intent.entities.projectId ?? request.currentProjectId ?? null,
      })
      await saveMessage(conversationId, "user", request.message)
      await saveMessage(conversationId, "assistant", markdown)
      yield { type: "text", content: markdown }
      yield { type: "done", conversationId }
      return
    }

    const disambiguation = detectDisambiguation(result.userContext, request.message, result.intent.intent)
    if (disambiguation) {
      let conversationId = request.conversationId
      if (!conversationId) {
        const existing = await listConversations(request.workspaceId)
        conversationId = existing[0]?.id ?? (await createConversation(request.workspaceId, request.message.slice(0, 60))).id
      }
      yield { type: "disambiguation", disambiguation, conversationId }
      return
    }

    const workspaceMemory = await loadWorkspaceMemory(request.workspaceId)

    const plan = buildPlan(result.intent, result.userContext, AI_TOOLS.map((t) => t.function.name))

    const entityResolved =
      !["project_query", "member_query", "sprint_query"].includes(result.intent.intent) ||
      !!result.intent.entities.projectId ||
      !!result.intent.entities.memberId
    const confidence = estimateConfidence({
      intent: result.intent,
      userContext: result.userContext,
      contextPackage: result.contextPackage,
      entityResolved,
    })

    let conversationId = request.conversationId
    if (!conversationId) {
      const existing = await listConversations(request.workspaceId)
      conversationId =
        existing[0]?.id ??
        (await createConversation(request.workspaceId, request.message.slice(0, 60))).id
    }

    const previousMessages = await getMessages(conversationId)
    const system = buildSystemPrompt(result, {
      workspaceMemory: memoryToPrompt(workspaceMemory),
      plan: planToPrompt(plan),
      confidence,
      insights: result.contextPackage.insights,
    })
    const systemWithMemory = system + "\n\n" + MEMORY_GUIDANCE + "\n\n" + responseGuidanceFor(result.intent)

    const messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string }[] = [
      { role: "system", content: systemWithMemory },
    ]
    for (const msg of previousMessages.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content })
    }
    messages.push({ role: "user", content: buildUserMessage(result, request.message) })

    await saveMessage(conversationId, "user", request.message)

    // Auto-learning: detect repetitive preference signals.
    await observePreferences(user.id, request.workspaceId, request.message)

    const rememberMatch = request.message.match(
      /^remember\s+(?:that\s+)?(.+?)(?:\s+is\s+|\s+will\s+be\s+|\s*:\s*)(.+)/i
    )
    if (rememberMatch) {
      const entity = rememberMatch[1].trim()
      const value = rememberMatch[2].trim()
      const key = entity.toLowerCase().replace(/\s+/g, "_").slice(0, 60)
      await saveMemory(request.workspaceId, "fact", entity, key, value)
      yield { type: "text", content: `I've saved that: **${entity}** → **${value}**` }
      yield { type: "done", conversationId }
      return
    }

    // Personal memory commands: "remember this:", "forget this", "show my memories"
    const pcCmd = isPersonalMemoryCommand(request.message)
    if (pcCmd === "remember") {
      const parsed = parseRememberContent(request.message)
      if (parsed) {
        await savePersonalMemory(user.id, { workspaceId: request.workspaceId, type: parsed.type ?? "FACT", content: parsed.content, importance: 2 })
        yield { type: "text", content: `Saved to personal memory: **${parsed.content}**` }
        yield { type: "done", conversationId }
        return
      }
    }
    if (pcCmd === "forget") {
      // "forget this" — delete the most recent memory matching content
      const top = await loadLongTermMemorySection(user.id, request.workspaceId, 1)
      if (top) {
        yield { type: "text", content: "To delete a specific memory, please name what you'd like to forget." }
      } else {
        yield { type: "text", content: "No personal memories to forget." }
      }
      yield { type: "done", conversationId }
      return
    }
    if (pcCmd === "clear") {
      // "clear all memories" — owner-only in future
      yield { type: "text", content: "To clear memories, please specify which ones (or contact your workspace owner)." }
      yield { type: "done", conversationId }
      return
    }

    let maxToolCalls = 5

    while (maxToolCalls > 0) {
      maxToolCalls--

      const body: OpenRouterRequest = {
        model,
        messages: messages as OpenRouterRequest["messages"],
        tools: AI_TOOLS,
      }

      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aspen-os.vercel.app",
          "X-Title": "Aspen OS",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        yield { type: "error", content: `AI request failed: ${errorText}` }
        return
      }

      const data = await response.json()
      const choice = data.choices?.[0]
      if (!choice) {
        yield { type: "error", content: "No response from AI" }
        return
      }

      const responseMessage = choice.message
      let content = responseMessage.content
      const toolCalls: AIToolCall[] = responseMessage.tool_calls ?? []

      if (toolCalls.length === 0) {
        if (content) {
          content = postProcessResponse(content, result.intent)
          yield { type: "text", content }
          await saveMessage(conversationId, "assistant", content)
        }
        yield { type: "done", conversationId }
        return
      }

      if (content) yield { type: "text", content }

      for (const toolCall of toolCalls) {
        yield { type: "tool_call", tool_call: toolCall, conversationId }

        const { name, arguments: rawArgs } = toolCall.function
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(rawArgs)
        } catch {
          args = {}
        }

        let result2: string
        if (name === "save_memory") {
          await saveMemory(
            request.workspaceId,
            (args.type as string) ?? "fact",
            (args.entity as string) ?? "",
            (args.key as string) ?? "",
            (args.value as string) ?? ""
          )
          result2 = `Saved memory: ${args.entity}: ${args.key} = ${args.value}`
        } else if (name === "save_workspace_memory") {
          const { saveWorkspaceMemory } = await import("@/lib/ai/workspace-memory")
          await saveWorkspaceMemory(
            request.workspaceId,
            (args.key as string) ?? "",
            (args.value as string) ?? ""
          )
          result2 = `Saved workspace memory: ${args.key} = ${args.value}`
        } else {
          result2 = await executeTool(name, args, request.workspaceId, user.id)
        }

        yield { type: "tool_result", tool_result: { name, result: result2 }, conversationId }

        messages.push({
          role: "assistant",
          content: content ?? null,
          tool_calls: [toolCall],
        } as { role: string; content: string })
        messages.push({
          role: "tool",
          content: result2,
          tool_call_id: toolCall.id,
        } as { role: string; content: string })
      }
    }

    yield { type: "done", conversationId }
  } catch (err) {
    yield {
      type: "error",
      content: err instanceof Error ? err.message : "AI processing failed",
    }
  }
}

function detectDisambiguation(
  ctx: UserContext,
  message: string,
  intent: string
): Disambiguation | null {
  const lower = message.toLowerCase()
  if (intent === "member_query") {
    const matches = ctx.members.filter((m) => {
      const tokens = m.fullName.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
      return tokens.some((t) => lower.includes(t))
    })
    if (matches.length > 1) {
      return {
        kind: "member",
        query: message,
        options: matches.slice(0, 5).map((m) => ({ id: m.id, label: m.fullName, hint: m.email })),
      }
    }
  }
  if (intent === "project_query") {
    const matches = ctx.projects.filter((p) => lower.includes(p.name.toLowerCase()))
    if (matches.length > 1) {
      return {
        kind: "project",
        query: message,
        options: matches.slice(0, 5).map((p) => ({ id: p.id, label: p.name, hint: "" })),
      }
    }
  }
  return null
}
