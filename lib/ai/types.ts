export type AIMessage = {
  role: "user" | "assistant" | "tool"
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

export type AIRequest = {
  messages: AIMessage[]
  workspaceId: string
  workspaceSlug: string
}

export type AIStreamChunk = {
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

export type AIContext = {
  recentTasks: string
  projects: string
  upcomingDeadlines: string
  workspaceMembers: string
}
