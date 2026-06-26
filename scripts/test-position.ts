/**
 * Pure unit checks for lib/utils/position.ts (T43 / audit M-5). No network
 * or database access — these are the algorithmic building blocks moveTask
 * relies on, tested in isolation.
 *
 * Usage: npm run test:position
 */

import {
  computePosition,
  needsRebalance,
  rebalancePositions,
} from "../lib/utils/position"

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

function testComputePosition(): void {
  assert(
    computePosition(null, null) === 1000,
    "empty column should seed at 1000"
  )
  assert(
    computePosition(1000, null) === 2000,
    "appending after the last item should add fixed spacing"
  )
  assert(
    computePosition(null, 1000) === 500,
    "inserting before the first item should take its midpoint with zero"
  )
  assert(
    computePosition(1000, 2000) === 1500,
    "inserting between two siblings should take their midpoint"
  )
  console.log("computePosition checks passed.")
}

function testNeedsRebalance(): void {
  assert(!needsRebalance(null, null), "empty column never needs rebalancing")
  assert(
    !needsRebalance(1000, null),
    "appending after the last item never needs rebalancing (pure addition)"
  )
  assert(
    !needsRebalance(1000, 2000),
    "a normal gap should not trigger rebalancing"
  )
  assert(
    needsRebalance(1000, 1000.5),
    "a sub-1 gap between two siblings should trigger rebalancing"
  )
  assert(
    needsRebalance(null, 0.5),
    "a sub-1 position with no lower neighbor should trigger rebalancing"
  )
  console.log("needsRebalance checks passed.")
}

function testRebalancePositions(): void {
  const positions = rebalancePositions(5)
  assert(positions.length === 5, "should return exactly the requested count")
  for (let i = 1; i < positions.length; i++) {
    assert(
      positions[i] > positions[i - 1],
      "rebalanced positions should be strictly ascending"
    )
  }
  console.log("rebalancePositions checks passed.")
}

// Simulates exactly what moveTask does, repeatedly inserting a new task
// before the current first item — the worst case for fractional-index
// precision, since each insert halves the remaining gap. Confirms
// rebalancing actually triggers under sustained pressure, and that visual
// order survives every rebalance.
function testRepeatedFrontInsertSimulation(): void {
  let column: { id: string; position: number }[] = [{ id: "seed", position: 1000 }]
  let rebalanceCount = 0

  for (let i = 0; i < 30; i++) {
    const newId = `task-${i}`
    const afterPosition = column[0].position

    if (needsRebalance(null, afterPosition)) {
      rebalanceCount++
      const rebalanced = rebalancePositions(column.length + 1)
      const rebalancedExisting = column.map((task, index) => ({
        ...task,
        position: rebalanced[index + 1],
      }))
      column = [{ id: newId, position: rebalanced[0] }, ...rebalancedExisting]
    } else {
      const newPosition = computePosition(null, afterPosition)
      column = [{ id: newId, position: newPosition }, ...column]
    }
  }

  assert(
    rebalanceCount > 0,
    "30 repeated front-inserts should have triggered at least one rebalance"
  )
  for (let i = 1; i < column.length; i++) {
    assert(
      column[i].position > column[i - 1].position,
      `visual order broke after ${rebalanceCount} rebalance(s): position at index ${i} did not increase`
    )
  }
  console.log(
    `Repeated front-insert simulation passed (${rebalanceCount} rebalance(s) over 30 inserts, order preserved).`
  )
}

testComputePosition()
testNeedsRebalance()
testRebalancePositions()
testRepeatedFrontInsertSimulation()
console.log("All position utility checks passed.")
