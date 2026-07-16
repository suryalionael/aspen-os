import type { TemporalResult, TemporalToken } from "@/lib/ai/types"

const DAY = 86_400_000

function iso(d: Date): string {
  return d.toISOString().split("T")[0]
}

function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // Monday = 0
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

/**
 * Temporal Engine. Understands natural date expressions automatically and
 * resolves them to concrete ISO dates / ranges — no clarification unless
 * genuinely ambiguous.
 *
 * Handles: today, tomorrow, yesterday, this/next/last week, current/last
 * sprint (approximated as 2-week windows until a sprints table exists),
 * recent, upcoming, weekday names, and "in N days".
 */
export function parseTemporal(message: string): TemporalResult {
  const lower = message.toLowerCase()
  const today = new Date()
  const t = (token: TemporalToken, label: string, extra: Partial<TemporalResult> = {}): TemporalResult => ({
    token,
    value: extra.value ?? null,
    rangeStart: extra.rangeStart ?? null,
    rangeEnd: extra.rangeEnd ?? null,
    label,
  })

  if (/\byesterday\b/.test(lower)) {
    const d = new Date(today.getTime() - DAY)
    return t("yesterday", "yesterday", { value: iso(d) })
  }
  if (/\btoday\b/.test(lower)) {
    return t("today", "today", { value: iso(today) })
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today.getTime() + DAY)
    return t("tomorrow", "tomorrow", { value: iso(d) })
  }

  const rel = lower.match(/\bin\s+(\d+)\s+days?\b/)
  if (rel) {
    const d = new Date(today.getTime() + Number(rel[1]) * DAY)
    return t("relative", `in ${rel[1]} days`, { value: iso(d) })
  }

  if (/\bthis week\b/.test(lower)) {
    const s = startOfWeek(today)
    const e = new Date(s.getTime() + 6 * DAY)
    return t("this_week", "this week", { rangeStart: iso(s), rangeEnd: iso(e) })
  }
  if (/\bnext week\b/.test(lower)) {
    const s = new Date(startOfWeek(today).getTime() + 7 * DAY)
    const e = new Date(s.getTime() + 6 * DAY)
    return t("next_week", "next week", { rangeStart: iso(s), rangeEnd: iso(e) })
  }
  if (/\blast week\b/.test(lower)) {
    const e = new Date(startOfWeek(today).getTime() - DAY)
    const s = new Date(e.getTime() - 6 * DAY)
    return t("last_week", "last week", { rangeStart: iso(s), rangeEnd: iso(e) })
  }

  // Sprints are approximated as 2-week iterations (no dedicated table yet).
  if (/\bcurrent sprint\b|\bthis sprint\b/.test(lower)) {
    const s = startOfWeek(today)
    const e = new Date(s.getTime() + 13 * DAY)
    return t("current_sprint", "current sprint", { rangeStart: iso(s), rangeEnd: iso(e) })
  }
  if (/\blast sprint\b/.test(lower)) {
    const e = new Date(startOfWeek(today).getTime() - DAY)
    const s = new Date(e.getTime() - 13 * DAY)
    return t("last_sprint", "last sprint", { rangeStart: iso(s), rangeEnd: iso(e) })
  }

  if (/\brecent\b|\blately\b|\brecently\b/.test(lower)) {
    const s = new Date(today.getTime() - 14 * DAY)
    return t("recent", "recent (last 14 days)", { rangeStart: iso(s), rangeEnd: iso(today) })
  }
  if (/\bupcoming\b|\bcoming\b|\bnext\b/.test(lower)) {
    const e = new Date(today.getTime() + 14 * DAY)
    return t("upcoming", "upcoming (next 14 days)", { rangeStart: iso(today), rangeEnd: iso(e) })
  }

  const dayMatch = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
  if (dayMatch) {
    const target = WEEKDAY_MAP[dayMatch[1]]
    const diff = (target - today.getDay() + 7) % 7 || 7
    const d = new Date(today.getTime() + diff * DAY)
    return t("weekday", dayMatch[1], { value: iso(d) })
  }

  return t(null, "any time")
}

export function temporalToDateFilter(
  tr: TemporalResult
): { dueOn?: string; dueBefore?: string; dueAfter?: string } {
  if (tr.value && (tr.token === "today" || tr.token === "tomorrow" || tr.token === "yesterday" || tr.token === "weekday" || tr.token === "relative")) {
    return { dueOn: tr.value }
  }
  if (tr.rangeStart && tr.rangeEnd) {
    if (tr.token === "this_week" || tr.token === "current_sprint" || tr.token === "upcoming" || tr.token === "recent") {
      return { dueAfter: tr.rangeStart, dueBefore: tr.rangeEnd }
    }
    if (tr.token === "next_week" || tr.token === "last_week" || tr.token === "last_sprint") {
      return { dueAfter: tr.rangeStart, dueBefore: tr.rangeEnd }
    }
  }
  return {}
}
