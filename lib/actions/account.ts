"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export type DeleteAccountState = { error: string } | undefined

const CONFIRMATION_PHRASE = "DELETE"

export async function deleteAccount(
  _prevState: DeleteAccountState,
  formData: FormData
): Promise<DeleteAccountState> {
  const confirmation = String(formData.get("confirmation") ?? "")

  if (confirmation !== CONFIRMATION_PHRASE) {
    return { error: `Type "${CONFIRMATION_PHRASE}" to confirm.` }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to delete your account." }
  }

  // The id comes from the caller's own verified session, never from
  // client-supplied input — this can only ever delete the calling user,
  // regardless of the elevated admin client's reach. Migration 009 gives
  // every dependent row a defined ON DELETE behavior, so this single call
  // atomically removes the user and everything they solely owned (or
  // un-assigns tasks they were merely assigned to) — see that migration's
  // comments for why each choice is correct.
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(user.id)

  if (error) {
    return { error: error.message }
  }

  await supabase.auth.signOut()
  redirect("/sign-in")
}
