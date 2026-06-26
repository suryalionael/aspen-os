import { type EmailOtpType } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"

// Verifies the token_hash from a Supabase email link (password recovery,
// and email confirmation if it's ever re-enabled) via verifyOtp rather than
// the PKCE code-exchange flow. token_hash is self-contained and doesn't
// depend on a code-verifier cookie surviving on the same browser/device
// that requested it — important specifically because email links are
// routinely opened in a different browser or in-app webview than the one
// that started the flow.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/"

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })
    if (!error) {
      redirect(next)
    }
  }

  redirect("/sign-in?error=invalid-reset-link")
}
