"use client"

import { useEffect } from "react"
import { GeistSans } from "geist/font/sans"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import "./globals.css"

// error.tsx does not catch failures in the root layout itself — only
// global-error.tsx does, and it must render its own <html>/<body> since it
// replaces the root layout entirely when triggered. Without this, a root
// layout error would still fall through to Next.js's default error page.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="font-sans antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                We hit an unexpected error. Try again, or come back in a
                moment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => reset()}>Try again</Button>
            </CardContent>
          </Card>
        </main>
      </body>
    </html>
  )
}
