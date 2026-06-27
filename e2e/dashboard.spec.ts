import { test, expect } from "@playwright/test"

/**
 * Sprint 2 Phase F: the workspace home page becomes a real dashboard
 * (Assigned tasks, Due today, Upcoming deadlines, Favorite projects,
 * Recent activity) instead of the Sprint 1 placeholder. Follows the same
 * conventions as e2e/task-management.spec.ts and e2e/project-management.spec.ts.
 */
test("dashboard surfaces assigned/due-today/upcoming tasks, favorite projects, and recent activity", async ({
  page,
}) => {
  const unique = Date.now()
  const email = `e2e-dashboard-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()

  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  const workspacePath = new URL(page.url()).pathname

  await page.getByRole("button", { name: "New" }).click()
  await page.getByLabel("Project name").fill(`E2E Project ${unique}`)
  await page.getByRole("button", { name: "Create project" }).click()
  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))
  const projectPath = new URL(page.url()).pathname

  // --- Create a task, set its due date to today, and assign it to self ---
  const quickAdd = page.getByPlaceholder("Add a task…")
  await quickAdd.fill("Dashboard task")
  await quickAdd.press("Enter")
  await expect(page.getByText("Dashboard task")).toBeVisible()

  await page.getByText("Dashboard task").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await page.getByRole("button", { name: "Add label" }).waitFor({ state: "visible" })

  const today = new Date().toISOString().slice(0, 10)
  await page.getByLabel("Due date").fill(today)
  await page.getByLabel("Assignee").selectOption({ label: email })
  const editPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await editPersisted
  await page.keyboard.press("Escape")

  // --- Favorite the project from the sidebar ---
  await page
    .getByRole("link", { name: `E2E Project ${unique}` })
    .locator("..")
    .getByRole("button", { name: "Add to favorites" })
    .click()
  await expect(page.getByRole("heading", { name: "Favorites" })).toBeVisible()

  // --- Visit the dashboard (workspace home) ---
  await page.goto(workspacePath)

  // CardTitle is nested inside CardHeader, which is itself a sibling of
  // CardContent within Card (not its parent) — "../.." walks heading ->
  // CardHeader -> Card so the descendant search also reaches CardContent.
  await expect(page.getByRole("heading", { name: "Assigned to you" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Assigned to you" }).locator("../..")
      .getByRole("link", { name: /Dashboard task/ })
  ).toBeVisible()

  await expect(page.getByRole("heading", { name: "Due today" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Due today" }).locator("../..")
      .getByRole("link", { name: /Dashboard task/ })
  ).toBeVisible()

  await expect(page.getByRole("heading", { name: "Favorite projects" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Favorite projects" }).locator("../..")
      .getByRole("link", { name: `E2E Project ${unique}` })
  ).toBeVisible()

  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Recent activity" }).locator("../..")
      .getByText("Dashboard task", { exact: false })
      .first()
  ).toBeVisible()

  // --- Clicking the assigned task deep-links straight into the project board ---
  await page
    .getByRole("heading", { name: "Assigned to you" })
    .locator("../..")
    .getByRole("link", { name: /Dashboard task/ })
    .click()
  await page.waitForURL((url) => url.pathname === projectPath)
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await expect(page.getByLabel("Title")).toHaveValue("Dashboard task")
})
