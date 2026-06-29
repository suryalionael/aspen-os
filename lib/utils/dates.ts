// Postgres `date` columns come back as a bare "YYYY-MM-DD" string with no
// time component. new Date("YYYY-MM-DD") parses it as UTC midnight, which
// then shifts to the wrong calendar day once converted to the viewer's
// local timezone in any negative-UTC-offset zone. Building the Date from
// explicit local Y/M/D components avoids that UTC round-trip entirely.
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function formatDueDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString()
}

export function isOverdue(dateStr: string, status: string): boolean {
  if (status === "done") return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return parseLocalDate(dateStr) < today
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`
}
