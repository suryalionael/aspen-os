import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params
  const supabase = await createClient()

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name, slug")
    .eq("slug", workspaceSlug)
    .maybeSingle()

  if (!workspace) {
    notFound()
  }

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>{workspace.name}</CardTitle>
          <CardDescription>No projects yet.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
