"use client"

import { useEffect } from "react"

import { applyTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme"

// Cross-device sync: the blocking inline script in app/layout.tsx applies
// whatever theme is already in localStorage on this device (or system
// preference if none) to avoid a flash of the wrong theme on first paint.
// This component runs after hydration and only acts when localStorage has
// no value yet — i.e. the user signed in on a new device and their saved
// preference (passed down from the server-rendered user_metadata) hasn't
// reached this device's storage yet.
export function ThemeSync({ initialTheme }: { initialTheme: Theme }) {
  useEffect(() => {
    if (!localStorage.getItem(THEME_STORAGE_KEY)) {
      localStorage.setItem(THEME_STORAGE_KEY, initialTheme)
      applyTheme(initialTheme)
    }
  }, [initialTheme])

  return null
}
