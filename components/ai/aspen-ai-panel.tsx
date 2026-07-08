"use client"

import { useState, useRef, useEffect } from "react"
import { Bot, Send, X, Loader2, AlertCircle, Sparkles, Search, FileText, Users, Folder } from "lucide-react"

import { processAIRequest } from "@/lib/ai/actions"
import type { AIStreamChunk } from "@/lib/ai/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  toolCalls?: { name: string; result: string }[]
}

const SUGGESTIONS = [
  "What should I work on today?",
  "Show overdue tasks",
  "Summarize all projects",
  "Find files in Drive",
  "Where is the latest document?",
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
      content: "I'm Aspen AI. Ask me about your projects, tasks, files, or team.",
    },
  ])
  const [input, setInput] = useState("")
  const [processing, setProcessing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
      const chunks = await processAIRequest({
        message: text,
        workspaceId,
        workspaceSlug,
      })

      let assistantContent = ""
      let toolCalls: { name: string; result: string }[] = []

      for (const chunk of chunks) {
        if (chunk.type === "text" && chunk.content) {
          assistantContent += chunk.content
        } else if (chunk.type === "tool_result" && chunk.tool_result) {
          toolCalls.push({
            name: chunk.tool_result.name,
            result: chunk.tool_result.result,
          })
        }
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantContent || "I processed your request.",
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, I encountered an error processing your request.",
        },
      ])
    } finally {
      setProcessing(false)
    }
  }

  function handleSuggestion(suggestion: string) {
    setInput(suggestion)
    setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-96 flex-col border-l border-border bg-background shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-semibold">Aspen AI</span>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1 ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/50 text-foreground"
              }`}
            >
              {msg.content}
            </div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {msg.toolCalls.map((tc, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    <Search className="h-3 w-3" />
                    {tc.name.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {processing && (
          <div className="flex items-start gap-2">
            <div className="rounded-xl bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSuggestion(s)}
              className="rounded-full border border-border bg-secondary/30 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
        <Input
          ref={inputRef}
          type="text"
          placeholder="Ask Aspen AI anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={processing}
          className="h-9 text-sm"
        />
        <Button
          type="submit"
          size="icon"
          disabled={processing || !input.trim()}
          className="h-9 w-9"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
