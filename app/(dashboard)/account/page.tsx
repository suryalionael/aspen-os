import { createClient } from "@/lib/supabase/server"
import { DeleteAccountForm } from "@/components/account/delete-account-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Signed in as {user?.email}. This permanently deletes your
            account and every workspace, project, and task you own. This
            cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountForm />
        </CardContent>
      </Card>
    </div>
  )
}
