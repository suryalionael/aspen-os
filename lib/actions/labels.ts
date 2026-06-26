"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/actions/tasks"
import { LABEL_COLORS, type Label } from "@/lib/labels"

const VALID_COLORS = LABEL_COLORS.map((option) => option.value)

export async function getProjectLabels(
  projectId: string
): Promise<{ error: string } | { success: true; labels: Label[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("labels")
    .select("id, name, color")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { success: true, labels: data ?? [] }
}

export async function getTaskLabels(
  taskId: string
): Promise<{ error: string } | { success: true; labels: Label[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("task_labels")
    .select("labels(id, name, color)")
    .eq("task_id", taskId)

  if (error) {
    return { error: error.message }
  }

  // PostgREST infers task_labels.labels as an array for this nested
  // select even though label_id -> labels.id is many-to-one; flattening
  // handles either shape it actually returns at runtime.
  const labels = (data ?? []).flatMap((row) =>
    Array.isArray(row.labels) ? row.labels : row.labels ? [row.labels] : []
  )

  return { success: true, labels }
}

export async function createLabel(
  projectId: string,
  name: string,
  color: string
): Promise<{ error: string } | { success: true; label: Label }> {
  const trimmedName = name.trim()
  if (!trimmedName) {
    return { error: "Label name is required." }
  }
  if (!VALID_COLORS.includes(color as (typeof VALID_COLORS)[number])) {
    return { error: "Invalid label color." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to create a label." }
  }

  const { data, error } = await supabase
    .from("labels")
    .insert({ project_id: projectId, name: trimmedName, color })
    .select("id, name, color")
    .single()

  if (error || !data) {
    return {
      error:
        error?.code === "23505"
          ? "A label with that name already exists."
          : error?.message ?? "Could not create label.",
    }
  }

  revalidatePath("/", "layout")
  return { success: true, label: data }
}

export async function deleteLabel(
  labelId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const { error } = await supabase.from("labels").delete().eq("id", labelId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function addLabelToTask(
  taskId: string,
  labelId: string,
  labelName: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to add a label." }
  }

  const { error } = await supabase
    .from("task_labels")
    .insert({ task_id: taskId, label_id: labelId })

  if (error) {
    return {
      error: error.code === "23505" ? "Label already added." : error.message,
    }
  }

  await logActivity(supabase, taskId, user.id, "label_added", {
    label_name: labelName,
  })
  revalidatePath("/", "layout")
  return { success: true }
}

export async function removeLabelFromTask(
  taskId: string,
  labelId: string,
  labelName: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to remove a label." }
  }

  const { error } = await supabase
    .from("task_labels")
    .delete()
    .eq("task_id", taskId)
    .eq("label_id", labelId)

  if (error) {
    return { error: error.message }
  }

  await logActivity(supabase, taskId, user.id, "label_removed", {
    label_name: labelName,
  })
  revalidatePath("/", "layout")
  return { success: true }
}
