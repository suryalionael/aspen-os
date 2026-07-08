"use server"

import { createClient } from "@/lib/supabase/server"
import { getOpenRouterConfig, OPENROUTER_BASE_URL } from "@/lib/ai/config"
import { buildContext } from "@/lib/ai/context"
import { AI_TOOLS, executeTool } from "@/lib/ai/tools"
import type { AIMessage, AIToolCall, AIStreamChunk, OpenRouterRequest } from "@/lib/ai/types"

const SYSTEM_PROMPT = `You are Aspen AI, an autonomous workplace agent for Aspen OS. You proactively investigate, analyze, and summarize information to help users manage their work.

## Core Behavior
- You are an AGENT, not a chatbot. Do not just answer questions — investigate, explore, and provide insights.
- Before responding, explore available data using your tools. If you don't find what you need, try a different approach.
- If a search fails, inspect the broader context (workspace root, similar names) before reporting failure.
- Always perform investigation before responding. Use multiple tools if needed.

## Capabilities
You can search tasks, projects, people, and files in the Aspen Training Centre Workspace.
You can explore folders, analyze workspace structure, search for documents, and summarize findings.
File access is restricted to the Aspen Training Centre Workspace folder only — you cannot access personal files or folders outside the workspace.

## Response Formatting
Always structure responses professionally.

### Tables
Use Markdown tables when showing 2+ records with the same fields (tasks, projects, files).

### Lists
Use bullet points for short lists (1-3 items).
Use numbered lists only for ranked or sequential items.

### Sections
Use ### headings to group different sections.
Use bold for emphasis on key values.

### Indicators
✅ Completed / done
⏳ In progress / pending
⚠️ Overdue / urgent
❌ Not started / backlog

## Workflows

### Exploring a Folder
When a user asks "what files are in [folder]" or "explore [folder]":
1. Use **explore_drive_folder** to search and list contents recursively.
2. If not found exactly, inspect the workspace root for similar folders.
3. List files, subfolders, sizes, and dates.
4. Summarize what the folder contains.

### Analyzing the Workspace
When a user asks to analyze or summarize the workspace:
1. Use **analyze_workspace** to scan the entire workspace.
2. Present folder structure, file types, and key statistics.

### Searching Documents
When a user asks to find or summarize a document:
1. Use **summarize_documents** to search by name or keyword.
2. List found documents with metadata and links.
3. Use **read_document** with the file ID to download and read the actual content.
4. Summarize what the document actually says, not just metadata.

### Reading a Document
When a user asks "summarize this document" or "what does this say":
1. First use **summarize_documents** or **search_drive** to find the file.
2. Then use **read_document** with the file's ID and name to get its content.
3. For TXT and Markdown files: full text will be returned.
4. For Google Docs: content will be exported as text.
5. For PDFs: metadata will be returned (open in Drive to view full content).
6. After reading, provide a summary of what the document contains.

### General Problem Solving
1. First, understand the user's intent — files, tasks, or general information.
2. Execute the appropriate tools.
3. If a tool returns no results, try similar searches or inspect the workspace root.
4. NEVER report "not found" without exploring alternatives first.
5. Combine results from multiple tools to build a complete picture.
6. Provide insights and recommendations based on what you found.

## Safety Rules
- **Never delete, move, or modify files without asking the user for explicit confirmation first.**
- When a user asks to delete something, explain what will happen and confirm before proceeding.
- When a user asks to move something, confirm the destination before proceeding.
- You can search, analyze, and summarize freely without confirmation.

## Guidelines
- Use tools to retrieve real data. Do not make up information.
- When showing tasks, include their status, project, and due date when available.
- When asked "What should I work on today?", check assigned tasks.
- When asked "Where is X?", search workspace files and tasks.
- Keep responses concise, structured, and actionable.`

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
