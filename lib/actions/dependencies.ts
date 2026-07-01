"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type TaskDependency = {
  task_id: string
  title: string
  status: string
}

export async function getProjectTaskTitles(
  projectId: string,
  excludeTaskId: string
): Promise<{ error: string } | { success: true; tasks: TaskDependency[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .neq("id", excludeTaskId)
    .order("title", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return {
    success: true,
    tasks: (data ?? []).map((task) => ({
      task_id: task.id,
      title: task.title,
      status: task.status,
    })),
  }
}

export async function getBlockingTasks(
  taskId: string
): Promise<{ error: string } | { success: true; blockers: TaskDependency[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("task_dependencies")
    .select("dependency_task_id, tasks!dependency_task_id(id, title, status)")
    .eq("dependent_task_id", taskId)

  if (error) {
    return { error: error.message }
  }

  const blockers = (data ?? []).map((row) => {
    const task = row.tasks as unknown as { id: string; title: string; status: string }
    return { task_id: task.id, title: task.title, status: task.status }
  })

  return { success: true, blockers }
}

export async function addBlocker(
  taskId: string,
  blockerTaskId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("task_dependencies")
    .insert({ dependent_task_id: taskId, dependency_task_id: blockerTaskId })

  if (error) {
    return {
      error: error.code === "23505" ? "Already a dependency." : error.message,
    }
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function removeBlocker(
  taskId: string,
  blockerTaskId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("dependent_task_id", taskId)
    .eq("dependency_task_id", blockerTaskId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/", "layout")
  return { success: true }
}
