// Falls back to the browser's/server's local zone (and to plain
// toLocaleString if the stored timezone string is somehow invalid) rather
// than throwing — a malformed or unset timezone preference should never
// break the Activity feed it's formatting.
export function formatDateTime(iso: string, timezone?: string | null): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone || undefined,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleString()
  }
}
