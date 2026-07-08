"use server"

import { createClient } from "@/lib/supabase/server"
import { getOpenRouterConfig, OPENROUTER_BASE_URL } from "@/lib/ai/config"
import { buildContext } from "@/lib/ai/context"
import { AI_TOOLS, executeTool } from "@/lib/ai/tools"
import type { AIMessage, AIToolCall, AIStreamChunk, OpenRouterRequest } from "@/lib/ai/types"

const SYSTEM_PROMPT = `You are Aspen AI, the AI operating system for Aspen OS — a workplace project management platform.

You help users manage their work, find information, and take actions.

## Capabilities
You can search tasks, projects, people, and Google Drive files.
You can summarize data and answer questions about the workspace.

## Rules
- Use tools to retrieve real data. Do not make up information.
- Be concise and direct.
- When showing tasks, include their status, project, and due date when available.
- When the user asks "What should I work on today?", check their assigned tasks.
- When asked "Where is X?", search Drive and tasks.
- Keep responses brief and actionable.`

export async function processAIRequest(
  request: { message: string; workspaceId: string; workspaceSlug: string }
): Promise<AIStreamChunk[]> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) return [{ type: "error", content: "Not authenticated" }]

  try {
    const { apiKey, model } = getOpenRouterConfig()
    const context = await buildContext(request.workspaceId, user.id)

    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Current workspace context:\n${context}\n\nUser request: ${request.message}` },
    ]

    const chunks: AIStreamChunk[] = []
    let maxToolCalls = 5

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
        chunks.push({ type: "done" })
        return chunks
      }

      for (const toolCall of toolCalls) {
        chunks.push({ type: "tool_call", tool_call: toolCall })

        const { name, arguments: rawArgs } = toolCall.function
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(rawArgs)
        } catch {
          args = {}
        }

        const result = await executeTool(name, args, request.workspaceId, user.id)
        chunks.push({ type: "tool_result", tool_result: { name, result } })

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

    chunks.push({ type: "done" })
    return chunks
  } catch (err) {
    return [{
      type: "error",
      content: err instanceof Error ? err.message : "AI processing failed",
    }]
  }
}

export async function getAspenAIModels(): Promise<string[]> {
  const models = ["deepseek/deepseek-chat", "qwen/qwen2.5-72b-instruct", "kimi/kimi-vl-2025"]
  return models
}
