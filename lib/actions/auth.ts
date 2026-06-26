"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export type AuthActionState = { error: string } | undefined

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "")
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "Email and password are required." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return { error: error.message }
  }

  // DEC-014: email confirmation must be disabled on the Supabase project so
  // sign-up returns a session immediately. If it's still enabled, surface
  // that clearly instead of redirecting into a session that doesn't exist.
  if (!data.session) {
    return {
      error:
        "Account created, but no session was returned. Email confirmation is likely still enabled on this Supabase project — disable it under Authentication → Providers → Email (see DECISION-LOG.md DEC-014).",
    }
  }

  redirect("/")
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "")
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "Email and password are required." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  redirect("/")
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/sign-in")
}

async function getOrigin(): Promise<string> {
  const headersList = await headers()
  const host = headersList.get("host")
  const protocol = host?.startsWith("localhost") ? "http" : "https"
  return `${protocol}://${host}`
}

export type RequestPasswordResetState =
  | { error: string }
  | { success: true }
  | undefined

export async function requestPasswordReset(
  _prevState: RequestPasswordResetState,
  formData: FormData
): Promise<RequestPasswordResetState> {
  const email = String(formData.get("email") ?? "").trim()

  if (!email) {
    return { error: "Email is required." }
  }

  const supabase = await createClient()
  const origin = await getOrigin()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/update-password`,
  })

  if (error) {
    return { error: error.message }
  }

  // Always returns success regardless of whether the email is registered —
  // Supabase itself doesn't leak that distinction via this call, and
  // confirming/denying account existence here would defeat that.
  return { success: true }
}

export type UpdatePasswordState = { error: string } | undefined

export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "")

  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: error.message }
  }

  redirect("/")
}
