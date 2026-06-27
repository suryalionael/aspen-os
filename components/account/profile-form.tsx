"use client"

import { useActionState, useMemo } from "react"

import { updateProfile, type Profile } from "@/lib/actions/profile"
import { applyTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
]

function getTimezoneOptions(current: string): string[] {
  let zones: string[]
  try {
    zones = Intl.supportedValuesOf("timeZone")
  } catch {
    zones = FALLBACK_TIMEZONES
  }
  return zones.includes(current) ? zones : [current, ...zones]
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction, isPending] = useActionState(updateProfile, undefined)
  const timezoneOptions = useMemo(() => getTimezoneOptions(profile.timezone), [profile.timezone])

  function handleThemeChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const theme = event.target.value as Theme
    // Applied immediately on change (not just after the form saves) so the
    // user sees the effect right away, same as every other optimistic
    // update in this app — the Server Action call below persists it.
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    applyTheme(theme)
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="bio" className="text-sm font-medium">
          Bio
        </label>
        <Textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={280}
          defaultValue={profile.bio}
          placeholder="Tell your teammates a bit about yourself…"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="theme" className="text-sm font-medium">
            Theme
          </label>
          <select
            id="theme"
            name="theme"
            defaultValue={profile.theme}
            onChange={handleThemeChange}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="timezone" className="text-sm font-medium">
            Timezone
          </label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={profile.timezone}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {timezoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="notificationsEnabled"
          defaultChecked={profile.notificationsEnabled}
        />
        Show in-app notifications for board activity
      </label>

      {state && "error" in state && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}
      <Button type="submit" size="sm" disabled={isPending} className="self-start">
        {isPending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  )
}
