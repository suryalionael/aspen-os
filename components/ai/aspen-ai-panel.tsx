"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Bot, Send, X, Loader2, Search, Sparkles, MessageSquare, Plus, Trash2 } from "lucide-react"

import { getAspenHomeDashboard } from "@/lib/ai/actions"
import { listConversations, createConversation, deleteConversation, updateConversationTitle } from "@/lib/ai/memory"
import type { AIStreamChunk, Disambiguation, HomeDashboard } from "@/lib/ai/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  actions?: { id: string; label: string }[]
  toolCalls?: { name: string; result: string }[]
  streaming?: boolean
}

type Conversation = {
  id: string
  title: string
}

function parseActionFence(content: string): { cleaned: string; actions: { id: string; label: string }[] } {
  const m = content.match(/```aspen-actions\s*\n([\s\S]*?)```/)
  if (!m) return { cleaned: content, actions: [] }
  const actions = m[1].split("\n").map((l) => l.match(/^([a-z0-9_]+)\s*:\s*(.+)$/i)).filter(Boolean).map((r) => ({ id: r![1], label: r![2] }))
  return { cleaned: content.replace(m[0], "").trim(), actions }
}

function Dashboard({ dashboard, onAction }: { dashboard: HomeDashboard; onAction: (msg: string) => void }) {
  const healthIcon = dashboard.health === "at_risk" ? "🔴" : dashboard.health === "attention" ? "🟡" : "🟢"
  return (
    <div className="flex flex-col gap-3 px-1 pt-2">
      <div className="text-sm font-semibold">{dashboard.greeting}</div>
      <div className="flex items-center gap-2 text-xs">
        <span>Workspace Health</span>
        <span className="flex items-center gap-1 rounded-full bg-secondary/50 px-2.5 py-0.5 font-medium">
          {healthIcon} {dashboard.health.replace("_", " ")}
        </span>
        <span className="text-muted-foreground">{dashboard.healthReason}</span>
      </div>
      {dashboard.focus.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today&apos;s Focus</div>
          <div className="flex flex-col gap-1">
            {dashboard.focus.map((f, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-secondary/20 px-2.5 py-1.5 text-xs">
                <span className="font-medium truncate">{f.title}</span>
                <span className="text-muted-foreground flex-shrink-0 ml-2">
                  {f.project}{f.due ? ` · ${f.due}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {dashboard.risks.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risks</div>
          {dashboard.risks.map((r, i) => (
            <div key={i} className="text-xs text-muted-foreground">⚠️ {r.description}</div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {dashboard.actions.map((a) => (
          <Button key={a.id} type="button" size="sm" variant="outline" className="text-xs h-7 px-2.5" onClick={() => onAction(a.label)}>
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function AspenAIPanel({
  workspaceId,
  workspaceSlug,
  currentProjectId,
  currentPage,
  selectedTaskId,
  selectedNoteId,
  selectedMeetingId,
  selectedMemberId,
  selectedSprintId,
  onClose,
}: {
  workspaceId: string
  workspaceSlug: string
  currentProjectId?: string | null
  currentPage?: string | null
  selectedTaskId?: string | null
  selectedNoteId?: string | null
  selectedMeetingId?: string | null
  selectedMemberId?: string | null
  selectedSprintId?: string | null
  onClose: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "",
    },
  ])
  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null)
  const [input, setInput] = useState("")
  const [processing, setProcessing] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [disambiguation, setDisambiguation] = useState<Disambiguation | null>(null)
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
    getAspenHomeDashboard({ workspaceId, workspaceSlug, currentProjectId, currentPage }).then(setDashboard).catch(() => {})
  }, [workspaceId, workspaceSlug, currentProjectId, currentPage, loadConversations])

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
    setDashboard(null)
    setDisambiguation(null)
    setProcessing(true)

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: text }
    setMessages((prev) => [...prev, userMessage])

    // Ensure a conversation exists so the engine persists under it.
    let convId = activeConversationId
    if (!convId && messages.length > 0) {
      try {
        const conv = await createConversation(workspaceId, text.slice(0, 60))
        convId = conv.id
        setActiveConversationId(conv.id)
        loadConversations()
        const title = text.length > 50 ? text.slice(0, 50) + "…" : text
        await updateConversationTitle(conv.id, title)
      } catch {}
    }

    const assistantId = crypto.randomUUID()
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", streaming: true }])

    const acc = {
      content: "",
      toolCalls: [] as { name: string; result: string }[],
      disambiguation: null as Disambiguation | null,
      dashboard: null as HomeDashboard | null,
      error: "",
    }

    const onChunk = (chunk: AIStreamChunk) => {
      if (chunk.conversationId) {
        setActiveConversationId(chunk.conversationId)
        loadConversations()
      }
      if (chunk.type === "error" && chunk.content) acc.error += chunk.content
      else if (chunk.type === "text" && chunk.content) acc.content += chunk.content
      else if (chunk.type === "tool_result" && chunk.tool_result)
        acc.toolCalls.push({ name: chunk.tool_result.name, result: chunk.tool_result.result })
      else if (chunk.type === "disambiguation" && chunk.disambiguation) acc.disambiguation = chunk.disambiguation
      else if (chunk.type === "home" && chunk.dashboard) acc.dashboard = chunk.dashboard

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: acc.content, toolCalls: acc.toolCalls.length ? acc.toolCalls : undefined }
            : m
        )
      )
    }

    try {
      await streamAspen(
        {
          message: text,
          workspaceId,
          workspaceSlug,
          currentProjectId,
          currentPage,
          selectedTaskId,
          selectedNoteId,
          selectedMeetingId,
          selectedMemberId,
          selectedSprintId,
          conversationId: convId ?? undefined,
        },
        onChunk
      )

      if (acc.disambiguation) {
        setDisambiguation(acc.disambiguation)
        setMessages((prev) => prev.filter((m) => m.id !== assistantId))
      } else if (acc.dashboard) {
        setDashboard(acc.dashboard)
        setMessages((prev) => prev.filter((m) => m.id !== assistantId))
      } else if (acc.error) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `⚠️ ${acc.error}`, streaming: false, toolCalls: undefined }
              : m
          )
        )
      } else if (acc.content) {
        const { cleaned, actions } = parseActionFence(acc.content)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: cleaned,
                  actions: actions.length > 0 ? actions : undefined,
                  toolCalls: acc.toolCalls.length ? acc.toolCalls : undefined,
                  streaming: false,
                }
              : m
          )
        )
      } else {
        const toolSummary = acc.toolCalls
          .map((tc) => `**${tc.name.replace(/_/g, " ")}**: ${tc.result}`)
          .join("\n\n")
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: toolSummary || "No response returned.",
                  toolCalls: acc.toolCalls.length ? acc.toolCalls : undefined,
                  streaming: false,
                }
              : m
          )
        )
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `⚠️ ${err instanceof Error ? err.message : "An unexpected error occurred."}`, streaming: false }
            : m
        )
      )
    } finally {
      setProcessing(false)
    }
  }

  async function streamAspen(
    payload: {
      message: string
      workspaceId: string
      workspaceSlug: string
      currentProjectId?: string | null
      currentPage?: string | null
      selectedTaskId?: string | null
      selectedNoteId?: string | null
      selectedMeetingId?: string | null
      selectedMemberId?: string | null
      selectedSprintId?: string | null
      conversationId?: string
    },
    onChunk: (chunk: AIStreamChunk) => void
  ) {
    const res = await fetch("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok || !res.body) {
      onChunk({ type: "error", content: `Request failed (${res.status})` })
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf("\0")) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        if (!line) continue
        try {
          onChunk(JSON.parse(line) as AIStreamChunk)
        } catch {
          // ignore malformed chunk
        }
      }
    }
  }

  function handleActionClick(label: string) {
    setInput(label)
    setTimeout(() => handleSubmit(), 0)
  }

  function handleDisambiguationSelect(option: { id: string; label: string }) {
    setDisambiguation(null)
    setInput(option.label)
    setTimeout(() => handleSubmit(), 0)
  }

  async function handleNewChat() {
    setMessages([{ id: "welcome", role: "assistant", content: "" }])
    setActiveConversationId(null)
    setDashboard(null)
    setDisambiguation(null)
    setShowHistory(false)
    getAspenHomeDashboard({ workspaceId, workspaceSlug, currentProjectId, currentPage }).then(setDashboard).catch(() => {})
  }

  async function handleSelectConversation(convId: string) {
    const { getMessages } = await import("@/lib/ai/memory")
    const msgs = await getMessages(convId)
    setActiveConversationId(convId)
    setMessages(msgs.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })))
    setDashboard(null)
    setDisambiguation(null)
    setShowHistory(false)
  }

  async function handleDeleteConversation(convId: string, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteConversation(convId)
    loadConversations()
    if (activeConversationId === convId) handleNewChat()
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
        {dashboard && messages.length <= 1 && (
          <Dashboard dashboard={dashboard} onAction={handleActionClick} />
        )}

        {disambiguation && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Multiple matches found for &quot;{disambiguation.query}&quot;:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {disambiguation.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleDisambiguationSelect(opt)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                >
                  {opt.label}
                  {opt.hint ? <span className="ml-1 text-muted-foreground">({opt.hint})</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.id === "welcome" && !msg.content && dashboard) return null
          return (
            <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[90%] ${msg.role === "user" ? "rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-sm text-primary-foreground" : "w-full"}`}>
                {msg.role === "user" ? (
                  <p className="leading-relaxed">{msg.content}</p>
                ) : msg.streaming && !msg.content ? (
                  <div className="flex items-center gap-2 rounded-2xl bg-secondary/50 px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Thinking…</span>
                  </div>
                ) : (
                  <>
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
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.actions.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => handleActionClick(a.label)}
                            className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
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
          )
        })}

        {processing && !messages.some((m) => m.streaming) && (
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-2 rounded-2xl bg-secondary/50 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Thinking…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {!dashboard && messages.length <= 1 && !disambiguation && (
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

const SUGGESTIONS = [
  "What should I work on today?",
  "Show completed tasks",
  "Summarize all projects",
  "Find files in Drive",
  "Remember sponsor deadline is July 20",
]
