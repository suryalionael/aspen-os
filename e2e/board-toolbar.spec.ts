import { test, expect } from "@playwright/test"

/**
 * Sprint 2 Phase B: board-level search, priority/label filter, and sort.
 * All client-side over the already-loaded task list — drag-and-drop is
 * deliberately disabled while any of these is active (see
 * kanban-board.tsx) since reordering a filtered/sorted view has no safe,
 * unambiguous mapping back onto the real fractional position data.
 */
test("search, filter, and sort narrow and reorder the board without losing data", async ({
  page,
}) => {
  const unique = Date.now()
  const email = `e2e-toolbar-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()

  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))

  await page.getByRole("button", { name: "New" }).click()
  await page.getByLabel("Project name").fill(`E2E Project ${unique}`)
  await page.getByRole("button", { name: "Create project" }).click()

  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))

  const quickAdd = page.getByPlaceholder("Add a task…")
  for (const title of ["Alpha task", "Beta task", "Gamma task"]) {
    await quickAdd.fill(title)
    await quickAdd.press("Enter")
    await expect(page.getByText(title)).toBeVisible()
  }

  // Give "Beta task" urgent priority so priority filter/sort have
  // something distinguishing to act on.
  await page.getByText("Beta task").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await page.getByRole("dialog").getByLabel("Priority").selectOption("urgent")
  const savePersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Save" }).click()
  await savePersisted
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("task-card").getByText("Urgent")).toBeVisible()

  // --- Search narrows to a single matching card ---
  await page.getByLabel("Search tasks").fill("Beta")
  await expect(page.getByTestId("task-card")).toHaveCount(1)
  await expect(page.getByText("Beta task")).toBeVisible()
  await expect(
    page.getByText("Drag and drop is disabled", { exact: false })
  ).toBeVisible()

  await page.getByLabel("Search tasks").fill("")
  await expect(page.getByTestId("task-card")).toHaveCount(3)

  // --- Priority filter narrows to just the urgent task ---
  await page.getByLabel("Filter by priority").selectOption("urgent")
  await expect(page.getByTestId("task-card")).toHaveCount(1)
  await expect(page.getByText("Beta task")).toBeVisible()

  await page.getByLabel("Filter by priority").selectOption("")
  await expect(page.getByTestId("task-card")).toHaveCount(3)

  // --- Sort by priority puts the urgent task first within its column ---
  await page.getByLabel("Sort tasks").selectOption("priority")
  const cardTitles = page.getByTestId("task-card").locator("span").first()
  await expect(cardTitles).toHaveText("Beta task")

  // Returning to manual order restores normal drag-and-drop (no warning).
  await page.getByLabel("Sort tasks").selectOption("manual")
  await expect(
    page.getByText("Drag and drop is disabled", { exact: false })
  ).toHaveCount(0)
  await expect(page.getByTestId("task-card")).toHaveCount(3)
})
