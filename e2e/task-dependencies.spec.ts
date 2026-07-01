import { test, expect } from "@playwright/test"

async function waitForDialogSettled(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Add label" }).waitFor({ state: "visible" })
  await page.getByRole("button", { name: "Add item" }).waitFor({ state: "visible" })
}

/**
 * Sprint 6: task dependencies — tasks can be marked as "blocked by" other
 * tasks in the same project via the task detail dialog.
 */
test("tasks can be blocked by sibling tasks, and unblocked after removal", async ({ page }) => {
  test.setTimeout(60_000)

  const unique = Date.now()
  const email = `e2e-deps-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E Deps Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))

  await page.getByRole("button", { name: "New" }).click()
  await page.getByLabel("Project name").fill(`E2E Deps Project ${unique}`)
  await page.getByRole("button", { name: "Create project" }).click()
  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))

  // --- Create two tasks ---
  const quickAdd = page.getByPlaceholder("Add a task…")
  await quickAdd.fill("Task Alpha")
  await quickAdd.press("Enter")
  await expect(page.getByText("Task Alpha")).toBeVisible()
  await quickAdd.fill("Task Beta")
  await quickAdd.press("Enter")
  await expect(page.getByText("Task Beta")).toBeVisible()

  // --- Open Task Alpha and mark it as blocked by Task Beta ---
  await page.getByTestId("task-card").filter({ hasText: "Task Alpha" }).getByText("Task Alpha").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)
  await page.getByRole("heading", { name: "Blocked by" }).waitFor({ state: "visible" })

  // Toggle Task Beta as a blocker — the button should become highlighted.
  await page.getByRole("button", { name: "Task Beta", exact: true }).click()
  await expect(page.getByText("⚠ This task is currently blocked.")).toBeVisible({ timeout: 8000 })

  // Remove the blocker.
  await page.getByRole("button", { name: "Task Beta", exact: true }).click()
  await expect(page.getByText("⚠ This task is currently blocked.")).not.toBeAttached({ timeout: 8000 })
})
