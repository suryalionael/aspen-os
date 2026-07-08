"use server"

import { createClient } from "@/lib/supabase/server"

export type Conversation = {
  id: string
  workspaceId: string
  userId: string
  title: string
  createdAt: string
  updatedAt: string
}

export type Message = {
  id: string
  conversationId: string
  role: "user" | "assistant" | "system"
  content: string
  createdAt: string
}

export type Memory = {
  id: string
  workspaceId: string
  userId: string
  type: string
  entity: string
  key: string
  value: string
  createdAt: string
}

export async function listConversations(
  workspaceId: string
): Promise<Conversation[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("ai_conversations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50)

  return (data ?? []).map((c) => ({
    id: c.id,
    workspaceId: c.workspace_id,
    userId: c.user_id,
    title: c.title,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }))
}

export async function createConversation(
  workspaceId: string,
  title = "New conversation"
): Promise<Conversation> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({
      workspace_id: workspaceId,
      user_id: session.user.id,
      title,
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? "Failed to create conversation")

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    userId: data.user_id,
    title: data.title,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from("ai_conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
}

export async function deleteConversation(
  conversationId: string
): Promise<void> {
  const supabase = await createClient()
  await supabase.from("ai_conversations").delete().eq("id", conversationId)
}

export async function getMessages(
  conversationId: string
): Promise<Message[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("ai_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })

  return (data ?? []).map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
    createdAt: m.created_at,
  }))
}

export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string
): Promise<void> {
  const supabase = await createClient()
  await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role,
    content,
  })

  await supabase
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
}

export async function saveMemory(
  workspaceId: string,
  type: string,
  entity: string,
  key: string,
  value: string
): Promise<void> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return

  await supabase.from("ai_memories").upsert(
    {
      workspace_id: workspaceId,
      user_id: session.user.id,
      type,
      entity,
      key,
      value,
    },
    { onConflict: "workspace_id, user_id, key" }
  )
}

export async function getMemories(
  workspaceId: string
): Promise<Memory[]> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return []

  const { data } = await supabase
    .from("ai_memories")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  return (data ?? []).map((m) => ({
    id: m.id,
    workspaceId: m.workspace_id,
    userId: m.user_id,
    type: m.type,
    entity: m.entity,
    key: m.key,
    value: m.value,
    createdAt: m.created_at,
  }))
}
