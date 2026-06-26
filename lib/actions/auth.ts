"use server"

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
