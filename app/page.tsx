import Link from "next/link"

import { signOut } from "@/lib/actions/auth"
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
        <CardContent className="flex flex-col gap-4">
          {user ? (
            <>
              <p className="text-sm text-muted-foreground">
                Signed in as{" "}
                <span className="font-medium text-foreground">
                  {user.email}
                </span>
              </p>
              <form action={signOut}>
                <Button type="submit" variant="outline">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/sign-up">Sign up</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
