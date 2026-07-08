import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/actions/profile"
import { getGoogleConnectionStatus } from "@/lib/google/actions"
import { AvatarUpload } from "@/components/account/avatar-upload"
import { ProfileForm } from "@/components/account/profile-form"
import { GoogleConnect } from "@/components/account/google-connect"
import { DeleteAccountForm } from "@/components/account/delete-account-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function AccountPage(props: {
  searchParams?: Promise<{ google_success?: string; google_error?: string }>
}) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  const profile = await getProfile()
  const googleStatus = await getGoogleConnectionStatus()
  const searchParams = await props.searchParams

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-6">
      {searchParams?.google_success && (
        <p className="w-full max-w-sm rounded-md bg-primary/10 px-4 py-2 text-sm text-primary">
          {searchParams.google_success}
        </p>
      )}
      {searchParams?.google_error && (
        <p className="w-full max-w-sm rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {searchParams.google_error}
        </p>
      )}

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
          <CardTitle>Google Drive</CardTitle>
          <CardDescription>
            Connect your Google account to access Drive files from within
            Aspen OS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleConnect status={googleStatus} />
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
