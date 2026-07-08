"use server"

import { createClient } from "@/lib/supabase/server"
import { getOpenRouterConfig, OPENROUTER_BASE_URL } from "@/lib/ai/config"
import { buildContext } from "@/lib/ai/context"
import { AI_TOOLS, executeTool } from "@/lib/ai/tools"
import { getMessages, saveMessage, saveMemory } from "@/lib/ai/memory"
import type { AIMessage, AIToolCall, AIStreamChunk, OpenRouterRequest } from "@/lib/ai/types"

const SYSTEM_PROMPT = `You are Aspen AI, an autonomous workplace agent for Aspen OS.

## Identity
You have persistent memory. You remember past conversations and important facts users tell you. Use this memory to provide consistent, informed assistance.

## Core Behavior
- You are an AGENT, not a chatbot. Investigate, explore, and provide insights.
- Before responding, explore available data using your tools.
- If a search fails, inspect the broader context before reporting failure.
- Always perform investigation before responding. Use multiple tools if needed.

## Memory
- When a user says "remember that..." or "note that...", save the information using the save_memory tool.
- When the user asks about something you might have been told before, recall it from memory.
- Memory types: fact, deadline, preference, note

## Response Formatting
Always structure responses professionally. Use Markdown tables for records, bullet points for short lists, and headings for sections.

## Workflows

### Remembering Information
When a user says "remember that X is Y":
1. Use the **save_memory** tool to store it.
2. Confirm to the user that you've saved it.
3. You'll automatically receive saved memories in your context for future conversations.

### Exploring a Folder
1. Use **explore_drive_folder** to search and list contents.
2. If not found exactly, inspect workspace root for similar folders.

### Searching Documents
1. Use **summarize_documents** to search by name.
2. Use **read_document** with the file ID to read actual content.
3. Summarize what the document actually says.

### General Problem Solving
1. Understand the user's intent.
2. Execute appropriate tools.
3. If no results, try alternative approaches.
4. Combine results from multiple tools.
5. Provide insights and recommendations.

## Safety Rules
- Never delete, move, or modify files without asking for confirmation.
- You can search, analyze, and summarize freely without confirmation.`

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

    // Auto-detect memory save intent
    const rememberMatch = request.message.match(/remember\s+(?:that\s+)?(.+?)(?:\s+is\s+|\s+will\s+be\s+|\s*:\s*)(.+)/i)
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
