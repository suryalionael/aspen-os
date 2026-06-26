// Resolves pre-implementation-audit.md finding M-4: workspace slugs must
// have a defined collision strategy so a collision never hard-fails the
// timed onboarding flow (DEC-005).

const MAX_SLUG_LENGTH = 60
const SUFFIX_LENGTH = 4

// Combining diacritical marks (U+0300-U+036F), built from char codes rather
// than a regex literal containing the raw combining characters themselves.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
)

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)

  return base.length > 0 ? base : "workspace"
}

function randomSuffix(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export function withRetrySuffix(slug: string): string {
  const truncatedBase = slug.slice(0, MAX_SLUG_LENGTH - SUFFIX_LENGTH - 1)
  return `${truncatedBase}-${randomSuffix(SUFFIX_LENGTH)}`
}
