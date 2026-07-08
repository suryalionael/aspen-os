"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Bot, Send, X, Loader2, Search, Sparkles, MessageSquare, Plus, Trash2 } from "lucide-react"

import { processAIRequest } from "@/lib/ai/actions"
import { listConversations, createConversation, deleteConversation, updateConversationTitle } from "@/lib/ai/memory"
import type { AIStreamChunk } from "@/lib/ai/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  toolCalls?: { name: string; result: string }[]
}

type Conversation = {
  id: string
  title: string
}

const SUGGESTIONS = [
  "What should I work on today?",
  "Show completed tasks",
  "Summarize all projects",
  "Find files in Drive",
  "Remember sponsor deadline is July 20",
]

export function AspenAIPanel({
  workspaceId,
  workspaceSlug,
  onClose,
}: {
  workspaceId: string
  workspaceSlug: string
  onClose: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "I'm **Aspen AI**. I remember our conversations and important information you tell me. Ask me about your projects, tasks, or files.",
    },
  ])
  const [input, setInput] = useState("")
  const [processing, setProcessing] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadConversations = useCallback(async () => {
    try {
      const list = await listConversations(workspaceId)
      setConversations(list.map((c) => ({ id: c.id, title: c.title })))
    } catch {}
  }, [workspaceId])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || processing) return

    setInput("")
    setProcessing(true)

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: text }
    setMessages((prev) => [...prev, userMessage])

    try {
      // Auto-title: update conversation title based on first message
      if (!activeConversationId && messages.length <= 1) {
        const conv = await createConversation(workspaceId, text.slice(0, 60))
        setActiveConversationId(conv.id)
        loadConversations()

        // Update title based on user message
        const title = text.length > 50 ? text.slice(0, 50) + "…" : text
        await updateConversationTitle(conv.id, title)
      }

      const chunks = await processAIRequest({
        message: text,
        workspaceId,
        workspaceSlug,
        conversationId: activeConversationId ?? undefined,
      })

      let assistantContent = ""
      let toolCalls: { name: string; result: string }[] = []
      let errorContent = ""

      for (const chunk of chunks) {
        if (chunk.type === "error" && chunk.content) {
          errorContent += chunk.content
        } else if (chunk.type === "text" && chunk.content) {
          assistantContent += chunk.content
        } else if (chunk.type === "tool_result" && chunk.tool_result) {
          toolCalls.push({
            name: chunk.tool_result.name,
            result: chunk.tool_result.result,
          })
        }
        if (chunk.conversationId) {
          setActiveConversationId(chunk.conversationId)
          loadConversations()
        }
      }

      if (errorContent) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${errorContent}` }])
      } else if (assistantContent) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: assistantContent, toolCalls: toolCalls.length > 0 ? toolCalls : undefined }])
      } else {
        const toolSummary = toolCalls.map((tc) => `**${tc.name.replace(/_/g, " ")}**: ${tc.result}`).join("\n\n")
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: toolSummary || "No response returned.", toolCalls: toolCalls.length > 0 ? toolCalls : undefined }])
      }
    } catch (err) {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${err instanceof Error ? err.message : "An unexpected error occurred."}` }])
    } finally {
      setProcessing(false)
    }
  }

  async function handleNewChat() {
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "I'm **Aspen AI**. I remember our conversations and important information you tell me. Ask me about your projects, tasks, or files.",
    }])
    setActiveConversationId(null)
    setShowHistory(false)
  }

  async function handleSelectConversation(convId: string) {
    const { getMessages } = await import("@/lib/ai/memory")
    const msgs = await getMessages(convId)
    setActiveConversationId(convId)
    setMessages(msgs.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })))
    setShowHistory(false)
  }

  async function handleDeleteConversation(convId: string, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteConversation(convId)
    loadConversations()
    if (activeConversationId === convId) {
      handleNewChat()
    }
  }

  function handleSuggestion(suggestion: string) {
    setInput(suggestion)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[28rem] flex-col border-l border-border bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="text-sm font-semibold">Aspen AI</span>
            <p className="text-[11px] text-muted-foreground">Workplace intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowHistory(!showHistory)}>
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showHistory && (
        <div className="max-h-48 overflow-y-auto border-b border-border px-3 py-2">
          <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Conversations
          </p>
          {conversations.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No previous conversations.</p>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                type="button"
                onClick={() => handleSelectConversation(conv.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  activeConversationId === conv.id
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                <MessageSquare className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{conv.title}</span>
                <button
                  type="button"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  className="ml-auto flex-shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </button>
            ))
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`max-w-[90%] ${msg.role === "user" ? "rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-sm text-primary-foreground" : "w-full"}`}>
              {msg.role === "user" ? (
                <p className="leading-relaxed">{msg.content}</p>
              ) : (
                <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table({ children }) {
                        return <div className="my-2 overflow-x-auto rounded-lg border border-border"><table className="min-w-full divide-y divide-border text-xs">{children}</table></div>
                      },
                      thead({ children }) { return <thead className="bg-muted/50">{children}</thead> },
                      th({ children }) { return <th className="px-3 py-2 text-left font-medium text-muted-foreground">{children}</th> },
                      td({ children }) { return <td className="px-3 py-2">{children}</td> },
                      tr({ children }) { return <tr className="border-b border-border last:border-0">{children}</tr> },
                      code({ className, children, ...props }) {
                        const isInline = !className
                        return isInline
                          ? <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{children}</code>
                          : <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs"><code className={className} {...props}>{children}</code></pre>
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mb-1 mt-2 flex flex-wrap gap-1.5">
                {msg.toolCalls.map((tc, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Search className="h-3 w-3" />
                    {tc.name.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {processing && (
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-2 rounded-2xl bg-secondary/50 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Thinking…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSuggestion(s)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/20 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
            >
              <Sparkles className="h-3 w-3" />
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border px-5 py-3">
        <Input
          ref={inputRef}
          type="text"
          placeholder="Ask Aspen AI anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={processing}
          className="h-10 rounded-xl border-border bg-muted/50 text-sm placeholder:text-muted-foreground/60"
        />
        <Button type="submit" size="icon" disabled={processing || !input.trim()} className="h-10 w-10 shrink-0 rounded-xl">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
