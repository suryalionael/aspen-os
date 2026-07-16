import { test } from "node:test"
import assert from "node:assert"
import { classifyIntent } from "@/lib/ai/intents"
import type { UserContext } from "@/lib/ai/types"

function makeCtx(over?: Partial<UserContext>): UserContext {
  return {
    user: { id: "u1", email: "a@b.c", fullName: "Alice", role: "member" },
    permissions: ["view_workspace", "view_all_tasks", "manage_tasks"],
    workspace: { id: "w1", name: "Test", slug: "test" },
    members: [],
    projects: [],
    project: null,
    page: null,
    selected: null,
    ...over,
  }
}

test("'summarize this' with selected task resolves selectedRef=task", () => {
  const ctx = makeCtx({ selected: { kind: "task", id: "t1", title: "Setup CI" } })
  const r = classifyIntent("summarize this", ctx)
  assert.equal(r.entities.selectedRef, "task")
})

test("'explain it' with selected note resolves selectedRef=note", () => {
  const ctx = makeCtx({ selected: { kind: "note", id: "n1", title: "Changelog notes" } })
  const r = classifyIntent("explain it", ctx)
  assert.equal(r.entities.selectedRef, "note")
})

test("'what is this?' with selected meeting resolves selectedRef=meeting", () => {
  const ctx = makeCtx({ selected: { kind: "meeting", id: "m1", title: "Sprint review" } })
  const r = classifyIntent("what is this?", ctx)
  assert.equal(r.entities.selectedRef, "meeting")
})

test("'show my tasks' with no selected does not set selectedRef", () => {
  const ctx = makeCtx()
  const r = classifyIntent("show my tasks", ctx)
  assert.equal(r.entities.selectedRef, null)
})

test("'what should I work on today' with selected still routes correct intent", () => {
  const ctx = makeCtx({ selected: { kind: "task", id: "t1", title: "Setup CI" } })
  const r = classifyIntent("what should I work on today", ctx)
  // Intent should still be planning-flagged, not misrouted
  assert.ok(["task_query", "planning", "calendar_query"].includes(r.intent))
  assert.equal(r.entities.selectedRef, null) // no reference words
})
