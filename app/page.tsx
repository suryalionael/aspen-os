import Link from "next/link"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("slug")
      .order("created_at", { ascending: true })
      .limit(1)

    if (workspaces && workspaces.length > 0) {
      redirect(`/${workspaces[0].slug}`)
    }

    redirect("/workspaces/new")
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Aspen OS</CardTitle>
          <CardDescription>
            The simplest and most enjoyable project operating system for
            nonprofit and community organizations.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/sign-up">Sign up</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
