export type Theme = "light" | "dark" | "system"

export const THEME_STORAGE_KEY = "aspen-theme"

export function resolveIsDark(theme: Theme): boolean {
  if (theme === "dark") return true
  if (theme === "light") return false
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  )
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", resolveIsDark(theme))
}
