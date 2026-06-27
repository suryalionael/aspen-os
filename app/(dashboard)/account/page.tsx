import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/actions/profile"
import { AvatarUpload } from "@/components/account/avatar-upload"
import { ProfileForm } from "@/components/account/profile-form"
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
  const profile = await getProfile()

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Signed in as {user?.email}.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <AvatarUpload initialAvatarUrl={profile?.avatarUrl ?? null} />
          {profile && <ProfileForm profile={profile} />}
        </CardContent>
      </Card>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            This permanently deletes your account and every workspace,
            project, and task you own. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountForm />
        </CardContent>
      </Card>
    </div>
  )
}
