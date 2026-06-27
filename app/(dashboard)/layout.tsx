import Image from "next/image"
import Link from "next/link"

import { signOut } from "@/lib/actions/auth"
import { createClient } from "@/lib/supabase/server"
import type { Theme } from "@/lib/theme"
import { Button } from "@/components/ui/button"
import { ThemeSync } from "@/components/theme-sync"
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const metadata = user?.user_metadata ?? {}
  const avatarUrl = typeof metadata.avatar_url === "string" ? metadata.avatar_url : null
  const theme: Theme =
    metadata.theme === "light" || metadata.theme === "dark" ? metadata.theme : "system"

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ThemeSync initialTheme={theme} />
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-primary">Aspen OS</span>
          <WorkspaceSwitcher />
        </div>
        <div className="flex items-center gap-3">
          {avatarUrl && (
            <Image
              src={avatarUrl}
              alt=""
              width={24}
              height={24}
              className="size-6 rounded-full object-cover"
            />
          )}
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <Link
            href="/account"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Account
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
