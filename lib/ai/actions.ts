"use server"

import { createClient } from "@/lib/supabase/server"
import { getOpenRouterConfig, OPENROUTER_BASE_URL } from "@/lib/ai/config"
import { buildContext } from "@/lib/ai/context"
import { AI_TOOLS, executeTool } from "@/lib/ai/tools"
import { getMessages, saveMessage, saveMemory } from "@/lib/ai/memory"
import type { AIMessage, AIToolCall, AIStreamChunk, OpenRouterRequest } from "@/lib/ai/types"

const SYSTEM_PROMPT = `You are Aspen AI, an autonomous workplace agent for Aspen OS.

## Identity
You have persistent memory. You remember past conversations and important facts users tell you.

## Core Behavior
- You are an AGENT, not a chatbot. Investigate, explore, and provide insights.
- Before responding, use your tools to explore available data.
- Combine results from multiple tools to build a complete picture.
- After providing analysis, suggest concrete next actions with explanations.
- Always ask for explicit approval before taking destructive actions.

## Memory
- You can save facts using the save_memory tool (type: fact, deadline, preference, note, decision, project_context, instruction).
- When a user says something that sounds like a project decision, deadline, or important instruction, point it out and ask if they'd like to save it.
- Your context automatically includes previously saved memories.

## Response Formatting
Use Markdown tables for records, bullet points for short lists, headings for sections. Keep responses concise and actionable.

## Workflows

### Project Analysis
When a user asks to analyze a project:
1. Use **analyze_project** with the project name.
2. Use **get_overdue_tasks** and **get_task_summary** for additional task data.
3. Use **search_drive** to find related files.
4. Check relevant memories from your context.
5. Provide: project health (On Track/Attention/Risk), progress, risks, recommendations.

### Document Review
When a user asks to review or analyze a document:
1. Use **summarize_documents** to find the document.
2. Use **read_document** to get the actual content.
3. Summarize what it says.
4. Suggest next actions based on the content (e.g., follow-ups, deadlines found).

### Detecting Important Information
When you notice the user sharing information that seems important (decisions, deadlines, preferences):
1. Point out what you noticed.
2. Ask if they'd like to save it to memory.
3. Do NOT save automatically — always ask first.

### General Problem Solving
1. Understand the user's intent.
2. Execute appropriate tools sequentially.
3. If no results, try alternative approaches.
4. Combine all findings into a structured response.
5. Suggest actionable next steps at the end.

## Safety Rules
- **Never delete, move, or modify files** without asking for explicit confirmation.
- **Never create, update, or delete tasks** without asking for explicit confirmation.
- You can search, analyze, read, and summarize freely without confirmation.
- When suggesting actions, always phrase them as recommendations the user can approve or decline.`

export async function processAIRequest(
  request: { message: string; workspaceId: string; workspaceSlug: string; conversationId?: string }
): Promise<AIStreamChunk[]> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) return [{ type: "error", content: "Not authenticated" }]

  try {
    const { apiKey, model } = getOpenRouterConfig()
    const context = await buildContext(request.workspaceId, user.id)

    let conversationId = request.conversationId

    if (!conversationId) {
      const { listConversations, createConversation } = await import("@/lib/ai/memory")
      const existing = await listConversations(request.workspaceId)
      conversationId = existing[0]?.id ?? (await createConversation(request.workspaceId, request.message.slice(0, 60))).id
    }

    const previousMessages = await getMessages(conversationId)

    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `Current workspace context:\n${context}` },
    ]

    for (const msg of previousMessages.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content })
    }

    messages.push({ role: "user", content: request.message })

    await saveMessage(conversationId, "user", request.message)

    const chunks: AIStreamChunk[] = []
    let maxToolCalls = 5

    // Auto-detect direct memory save intent ("remember that X is Y")
    const rememberMatch = request.message.match(/^remember\s+(?:that\s+)?(.+?)(?:\s+is\s+|\s+will\s+be\s+|\s*:\s*)(.+)/i)
    if (rememberMatch) {
      const entity = rememberMatch[1].trim()
      const value = rememberMatch[2].trim()
      const key = entity.toLowerCase().replace(/\s+/g, "_").slice(0, 60)

      await saveMemory(request.workspaceId, "fact", entity, key, value)
      chunks.push({ type: "text", content: `I've saved that: **${entity}** → **${value}**` })
      chunks.push({ type: "done" })
      return chunks
    }

    while (maxToolCalls > 0) {
      maxToolCalls--

      const body: OpenRouterRequest = {
        model,
        messages,
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
        return [{ type: "error", content: `AI request failed: ${errorText}` }]
      }

      const data = await response.json()
      const choice = data.choices?.[0]
      if (!choice) return [{ type: "error", content: "No response from AI" }]

      const responseMessage = choice.message
      const content = responseMessage.content

      if (content) {
        chunks.push({ type: "text", content })
      }

      const toolCalls: AIToolCall[] = responseMessage.tool_calls ?? []

      if (toolCalls.length === 0) {
        if (content) {
          await saveMessage(conversationId, "assistant", content)
        }
        chunks.push({ type: "done", conversationId })
        return chunks
      }

      for (const toolCall of toolCalls) {
        chunks.push({ type: "tool_call", tool_call: toolCall, conversationId })

        const { name, arguments: rawArgs } = toolCall.function
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(rawArgs) } catch { args = {} }

        if (name === "save_memory") {
          const { saveMemory: saveMem } = await import("@/lib/ai/memory")
          await saveMem(
            request.workspaceId,
            (args.type as string) ?? "fact",
            (args.entity as string) ?? "",
            (args.key as string) ?? "",
            (args.value as string) ?? ""
          )
          const memResult = `Saved memory: ${args.entity}: ${args.key} = ${args.value}`
          chunks.push({ type: "tool_result", tool_result: { name, result: memResult }, conversationId })
          messages.push({
            role: "assistant",
            content: content ?? null,
            tool_calls: [toolCall],
          } as unknown as { role: string; content: string })
          messages.push({ role: "tool", content: memResult, tool_call_id: toolCall.id } as unknown as { role: string; content: string })
          continue
        }

        const result = await executeTool(name, args, request.workspaceId, user.id)
        chunks.push({ type: "tool_result", tool_result: { name, result }, conversationId })

        messages.push({
          role: "assistant",
          content: content ?? null,
          tool_calls: [toolCall],
        } as unknown as { role: string; content: string })

        messages.push({
          role: "tool",
          content: result,
          tool_call_id: toolCall.id,
        } as unknown as { role: string; content: string })
      }
    }

    chunks.push({ type: "done", conversationId })
    return chunks
  } catch (err) {
    return [{
      type: "error",
      content: err instanceof Error ? err.message : "AI processing failed",
    }]
  }
}

export async function getAspenAIModels(): Promise<string[]> {
  return ["deepseek/deepseek-chat", "qwen/qwen2.5-72b-instruct", "kimi/kimi-vl-2025"]
}
