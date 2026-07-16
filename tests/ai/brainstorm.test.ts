import { test } from "node:test"
import assert from "node:assert"
import { classifyIntent } from "@/lib/ai/intents"
import { routeFastPath } from "@/lib/ai/fast-path"
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

test("classifies 'brainstorm ideas' as brainstorm intent", () => {
  const r = classifyIntent("brainstorm ideas for our marketing campaign", makeCtx())
  assert.equal(r.intent, "brainstorm")
  assert.ok(r.confidence > 0)
})

test("classifies 'give me 10 ideas' as brainstorm", () => {
  const r = classifyIntent("give me 10 ideas for project naming", makeCtx())
  assert.equal(r.intent, "brainstorm")
})

test("classifies 'help me think' as brainstorm", () => {
  const r = classifyIntent("help me think about this problem", makeCtx())
  assert.equal(r.intent, "brainstorm")
})

test("classifies 'creative ideas for nonprofit outreach' as brainstorm", () => {
  const r = classifyIntent("creative ideas for nonprofit outreach", makeCtx())
  assert.equal(r.intent, "brainstorm")
})

test("brainstorm is NOT fast-patched (falls through to LLM)", () => {
  const e = {
    scopeMe: false,
    projectId: null,
    projectName: null,
    memberId: null,
    memberName: null,
    status: null,
    dateToken: null,
    dateValue: null,
    temporal: null,
    keywords: [],
    selectedRef: null,
  }
  // Fast path should return null for brainstorm — it must go to LLM.
  assert.equal(routeFastPath("brainstorm ideas", "brainstorm", e), null)
})

test("strategic planning intent still works", () => {
  const r = classifyIntent("what should I work on today", makeCtx())
  assert.ok(r.intent === "planning" || r.intent === "task_query" || r.intent === "calendar_query")
})

test("regular task query unaffected by brainstorm keywords", () => {
  const r = classifyIntent("show my tasks", makeCtx())
  assert.ok(r.intent === "task_query")
})
