import { WorkspaceCreateForm } from "@/components/workspace/workspace-create-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function NewWorkspacePage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your workspace</CardTitle>
          <CardDescription>
            One name is all it takes — you can invite your team later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceCreateForm />
        </CardContent>
      </Card>
    </div>
  )
}
