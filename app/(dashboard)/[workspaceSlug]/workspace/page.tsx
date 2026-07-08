import { redirect } from "next/navigation"
import { FolderOpen } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { WorkspaceExplorer } from "@/components/workspace/workspace-explorer"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import Link from "next/link"

export default async function WorkspacePage(props: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await props.params
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) redirect("/sign-in")

  const { data: connection } = await supabase
    .from("user_google_connections")
    .select("id, google_email")
    .eq("user_id", session.user.id)
    .single()

  if (!connection) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
              <div>
                <CardTitle>Workspace Drive</CardTitle>
                <CardDescription>
                  Access your Google Drive files directly from Aspen OS.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Connect your Google account to browse, search, upload, and manage
              your Drive files without leaving Aspen OS.
            </p>
            <Link href="/account">
              <Button type="button" variant="default" className="w-full">
                Connect Google account
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <WorkspaceExplorer />
}
