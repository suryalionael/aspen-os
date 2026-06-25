import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Aspen OS</CardTitle>
          <CardDescription>
            The simplest and most enjoyable project operating system for
            nonprofit and community organizations. This page exists to
            confirm the Phase 1 foundation — Tailwind theme tokens, shadcn/ui
            components, and the deploy pipeline — is working end-to-end.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input placeholder="Foundation check input" disabled />
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
