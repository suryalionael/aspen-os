import { test, expect, type Page } from "@playwright/test"

async function waitForDialogSettled(page: Page) {
  await page.getByRole("button", { name: "Add label" }).waitFor({ state: "visible" })
  await page.getByRole("button", { name: "Add item" }).waitFor({ state: "visible" })
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Sprint 3 Phase L: every project gets a Calendar view alongside Kanban,
 * toggled in place (no route change), with month/week modes and
 * drag-to-reschedule (drop a task chip on a different day -> due_date
 * updates via updateTaskDueDate).
 */
test("calendar view shows tasks by due date, toggles month/week, and drag-to-reschedule updates due_date", async ({
  page,
}) => {
  const unique = Date.now()
  const email = `e2e-calendar-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E Calendar Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))

  await page.getByRole("button", { name: "New" }).click()
  await page.getByLabel("Project name").fill(`E2E Calendar Project ${unique}`)
  await page.getByRole("button", { name: "Create project" }).click()
  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))

  const quickAdd = page.getByPlaceholder("Add a task…")
  await quickAdd.fill("Calendar task")
  await quickAdd.press("Enter")
  await expect(page.getByText("Calendar task")).toBeVisible()

  await page.getByTestId("task-card").getByText("Calendar task").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)

  const today = new Date()
  const todayKey = toDateKey(today)
  await page.getByLabel("Due date").fill(todayKey)
  const savePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await savePersisted
  await page.keyboard.press("Escape")

  // --- Toggle to Calendar view: the task appears on today's cell ---
  await page.getByRole("button", { name: "Calendar", exact: true }).click()
  const todayCell = page.locator(`[data-date="${todayKey}"]`)
  await expect(todayCell.getByText("Calendar task")).toBeVisible()

  // --- Month/Week toggle ---
  await page.getByRole("button", { name: "Week", exact: true }).click()
  await expect(page.locator(`[data-date="${todayKey}"]`).getByText("Calendar task")).toBeVisible()
  await page.getByRole("button", { name: "Month", exact: true }).click()

  // --- Drag the task chip from today's cell to a day 2 days from now ---
  const targetDate = new Date(today)
  targetDate.setDate(targetDate.getDate() + 2)
  const targetKey = toDateKey(targetDate)
  const targetCell = page.locator(`[data-date="${targetKey}"]`)

  // The grid can be taller than the viewport — scroll the target row into
  // view first so its bounding box (and the synthetic mouse coordinates
  // derived from it) actually fall within the visible page. Confirmed
  // directly: without this, the target cell's measured y-coordinate landed
  // past the viewport's bottom edge, so the drop never registered.
  await targetCell.scrollIntoViewIfNeeded()

  const chip = page.getByTestId("calendar-task-chip").filter({ hasText: "Calendar task" })
  const sourceBox = await chip.boundingBox()
  const targetBox = await targetCell.boundingBox()
  if (!sourceBox || !targetBox) {
    throw new Error("Could not measure drag source/target bounding boxes")
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 10, sourceBox.y + 10, { steps: 5 })
  const dueDatePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 10 }
  )
  await page.mouse.up()
  await dueDatePersisted

  await expect(targetCell.getByText("Calendar task")).toBeVisible()
  await expect(todayCell.getByText("Calendar task")).toHaveCount(0)

  // --- Persisted server-side, not just optimistic: confirm via the
  // dialog after a full reload ---
  await page.reload()
  await page.getByRole("button", { name: "Calendar", exact: true }).click()
  await expect(page.locator(`[data-date="${targetKey}"]`).getByText("Calendar task")).toBeVisible()
  await page.getByTestId("calendar-task-chip").filter({ hasText: "Calendar task" }).click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await expect(page.getByLabel("Due date")).toHaveValue(targetKey)
})
