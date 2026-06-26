import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { getInviteWorkspaceName } from "@/lib/actions/workspaces"
import { JoinWorkspaceButton } from "@/components/workspace/join-workspace-button"

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const result = await getInviteWorkspaceName(token)
  const workspaceName = "success" in result ? result.workspaceName : null

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!workspaceName) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <h1 className="text-lg font-semibold">Invite link not found</h1>
          <p className="text-sm text-muted-foreground">
            This invite link is invalid or has been revoked. Ask the workspace
            owner to send you a new one.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-semibold">
          You&rsquo;ve been invited to join {workspaceName}
        </h1>
        {user ? (
          <JoinWorkspaceButton token={token} />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Sign up or sign in, then come back to this link to join.
            </p>
            <div className="flex justify-center gap-3">
              <Link
                href="/sign-up"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign up
              </Link>
              <Link
                href="/sign-in"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
