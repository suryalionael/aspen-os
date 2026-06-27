"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

// DEC-024: bio/theme/timezone/notifications live in user_metadata, not a
// dedicated table — none of them are ever read by anyone other than their
// own owner this sprint.
export type Profile = {
  bio: string
  theme: "light" | "dark" | "system"
  timezone: string
  notificationsEnabled: boolean
  avatarUrl: string | null
}

function readProfile(metadata: Record<string, unknown>): Profile {
  const theme = metadata.theme
  return {
    bio: typeof metadata.bio === "string" ? metadata.bio : "",
    theme: theme === "light" || theme === "dark" ? theme : "system",
    timezone:
      typeof metadata.timezone === "string" && metadata.timezone
        ? metadata.timezone
        : "UTC",
    notificationsEnabled: metadata.notifications_enabled !== false,
    avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
  }
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null
  return readProfile(user.user_metadata ?? {})
}

export type UpdateProfileState = { error: string } | { success: true } | undefined

const THEME_VALUES = ["light", "dark", "system"]

export async function updateProfile(
  _prevState: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 280)
  const theme = String(formData.get("theme") ?? "system")
  const timezone = String(formData.get("timezone") ?? "UTC").trim()
  const notificationsEnabled = formData.get("notificationsEnabled") === "on"

  if (!THEME_VALUES.includes(theme)) {
    return { error: "Invalid theme." }
  }
  if (!timezone) {
    return { error: "Timezone is required." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({
    data: {
      bio,
      theme,
      timezone,
      notifications_enabled: notificationsEnabled,
    },
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/", "layout")
  return { success: true }
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export type UploadAvatarState = { error: string } | { success: true; avatarUrl: string } | undefined

export async function uploadAvatar(
  _prevState: UploadAvatarState,
  formData: FormData
): Promise<UploadAvatarState> {
  const file = formData.get("avatar")

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." }
  }
  if (!file.type.startsWith("image/")) {
    return { error: "Avatar must be an image file." }
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "Avatar must be smaller than 2MB." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to upload an avatar." }
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg"
  // Fixed filename per user (not a unique one per upload) — old avatars
  // are meant to be replaced, not accumulated, and upsert:true means a
  // re-upload simply overwrites the previous object at the same path.
  const path = `${user.id}/avatar.${extension}`

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    return { error: uploadError.message }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path)
  // Cache-bust: the path is stable across re-uploads, so without a query
  // param the browser (and any CDN) would keep serving the old cached
  // image after a new avatar replaces it at the same URL.
  const avatarUrl = `${publicUrl}?v=${Date.now()}`

  const { error: updateError } = await supabase.auth.updateUser({
    data: { avatar_url: avatarUrl },
  })

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath("/", "layout")
  return { success: true, avatarUrl }
}

export async function removeAvatar(): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to remove your avatar." }
  }

  const { data: files } = await supabase.storage.from("avatars").list(user.id)
  if (files && files.length > 0) {
    await supabase.storage
      .from("avatars")
      .remove(files.map((file) => `${user.id}/${file.name}`))
  }

  const { error } = await supabase.auth.updateUser({ data: { avatar_url: null } })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/", "layout")
  return { success: true }
}
