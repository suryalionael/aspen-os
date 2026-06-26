// DEC-019 / audit M-5: fractional position ordering with a rebalance
// safeguard. Inserting between two siblings takes their midpoint; once two
// adjacent positions converge below MIN_GAP, further midpoints would lose
// meaningful precision, so the whole destination column is re-spaced first.

const INITIAL_SPACING = 1000
const MIN_GAP = 1

export function computePosition(
  beforePosition: number | null,
  afterPosition: number | null
): number {
  if (beforePosition === null && afterPosition === null) {
    return INITIAL_SPACING
  }
  if (beforePosition === null) {
    return afterPosition! / 2
  }
  if (afterPosition === null) {
    return beforePosition + INITIAL_SPACING
  }
  return (beforePosition + afterPosition) / 2
}

export function needsRebalance(
  beforePosition: number | null,
  afterPosition: number | null
): boolean {
  if (beforePosition !== null && afterPosition !== null) {
    return afterPosition - beforePosition < MIN_GAP
  }
  if (beforePosition === null && afterPosition !== null) {
    return afterPosition < MIN_GAP
  }
  // Appending after the last item (afterPosition === null) only ever adds
  // INITIAL_SPACING — no division, so no precision risk, regardless of how
  // many times it happens.
  return false
}

export function rebalancePositions(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * INITIAL_SPACING)
}
