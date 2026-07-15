import { test } from "node:test"
import assert from "node:assert"
import { routeFastPath } from "@/lib/ai/fast-path"
import type { IntentEntities } from "@/lib/ai/types"

function e(over: Partial<IntentEntities> = {}): IntentEntities {
  return {
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
    ...over,
  }
}

test("routes 'my tasks' to fast my_tasks", () => {
  assert.equal(routeFastPath("show my tasks", "task_query", e({ scopeMe: true })), "my_tasks")
})

test("routes 'tasks assigned to me' to my_tasks", () => {
  assert.equal(
    routeFastPath("list tasks assigned to me", "task_query", e({ scopeMe: true })),
    "my_tasks"
  )
})

test("routes due today to fast due_today", () => {
  assert.equal(
    routeFastPath("what is due today", "calendar_query", e({ dateToken: "today" })),
    "due_today"
  )
})

test("routes overdue to fast overdue", () => {
  assert.equal(
    routeFastPath("show overdue", "task_query", e({ dateToken: "overdue" })),
    "overdue"
  )
})

test("routes risk/blocked to fast blocked", () => {
  assert.equal(routeFastPath("what is blocked", "risk_analysis", e()), "blocked")
})

test("routes project status to fast project_status", () => {
  assert.equal(routeFastPath("project status", "project_query", e()), "project_status")
})

test("routes workspace health to fast workspace_health", () => {
  assert.equal(routeFastPath("workspace health", "workspace_analytics", e()), "workspace_health")
})

test("routes recent activity to fast recent_activity", () => {
  assert.equal(routeFastPath("recent activity", "workspace_analytics", e()), "recent_activity")
})

test("routes my workload to fast my_workload", () => {
  assert.equal(
    routeFastPath("my workload", "planning", e({ scopeMe: true })),
    "my_workload"
  )
})

test("routes bare calendar query to fast calendar_today", () => {
  assert.equal(routeFastPath("calendar today", "calendar_query", e()), "calendar_today")
})

test("falls through to null for non-deterministic asks", () => {
  assert.equal(routeFastPath("write me a poem about our roadmap", "general_chat", e()), null)
  assert.equal(routeFastPath("why is velocity dropping?", "risk_analysis", e({ scopeMe: true })), "blocked")
})
