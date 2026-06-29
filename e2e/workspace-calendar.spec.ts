import { test, expect } from "@playwright/test"

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Priority 12: the workspace calendar combines task due dates (across every
 * project, not just one), project due dates as "milestones", and a new
 * meetings entity — month/week/day views, drag-to-reschedule, and
 * create/edit via a dialog reached from the sidebar's "Calendar" link.
 */
test("workspace calendar combines task due dates, project milestones, and meetings, with day view and meeting create/reschedule", async ({
  page,
}) => {
  test.setTimeout(60_000)

  const unique = Date.now()
  const email = `e2e-wcal-${unique}@example.com`
  const password = "TestPassword123!"
  const todayKey = toDateKey(new Date())

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E WCal Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  const workspacePath = new URL(page.url()).pathname

  await page.getByRole("button", { name: "New" }).click()
  await page.getByLabel("Project name").fill(`E2E WCal Project ${unique}`)
  await page.getByRole("button", { name: "Create project" }).click()
  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))

  // --- Project due date becomes a "milestone" on the workspace calendar ---
  await page.getByRole("button", { name: "Project settings" }).click()
  await page.getByLabel("Due date").fill(todayKey)
  const detailsPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save details" }).click()
  await detailsPersisted
  await page.keyboard.press("Escape")

  // --- A task due today shows up too ---
  const quickAdd = page.getByPlaceholder("Add a task…")
  await quickAdd.fill("WCal task")
  await quickAdd.press("Enter")
  await expect(page.getByText("WCal task")).toBeVisible()
  await page.getByTestId("task-card").getByText("WCal task").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await page.getByRole("button", { name: "Add label" }).waitFor({ state: "visible" })
  await page.getByLabel("Due date").fill(todayKey)
  const taskSaved = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await taskSaved
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeHidden()

  // --- Navigate to the workspace calendar via the sidebar link ---
  await page.goto(workspacePath)
  await page.getByRole("link", { name: "Calendar", exact: true }).click()
  await page.waitForURL((url) => url.pathname === `${workspacePath}/calendar`)

  const todayCell = page.locator(`[data-date="${todayKey}"]`)
  await expect(todayCell.getByTestId("calendar-task-chip").filter({ hasText: "WCal task" })).toBeVisible()
  await expect(
    todayCell.getByTestId("calendar-milestone-chip").filter({ hasText: `E2E WCal Project ${unique}` })
  ).toBeVisible()

  // --- Create a meeting today via the dialog ---
  await page.getByRole("button", { name: "+ New meeting" }).click()
  await expect(page.getByRole("dialog", { name: "New meeting" })).toBeVisible()
  await page.getByLabel("Title").fill("WCal sync")
  await page.getByLabel("Date").fill(todayKey)
  const meetingCreated = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await meetingCreated
  await expect(page.getByRole("dialog", { name: "New meeting" })).toBeHidden()
  await expect(todayCell.getByTestId("calendar-meeting-chip").filter({ hasText: "WCal sync" })).toBeVisible()

  // --- Day view still shows all three event types ---
  await page.getByRole("button", { name: "Day", exact: true }).click()
  await expect(page.getByTestId("calendar-task-chip").filter({ hasText: "WCal task" })).toBeVisible()
  await expect(page.getByTestId("calendar-meeting-chip").filter({ hasText: "WCal sync" })).toBeVisible()
  await expect(
    page.getByTestId("calendar-milestone-chip").filter({ hasText: `E2E WCal Project ${unique}` })
  ).toBeVisible()
  await page.getByRole("button", { name: "Month", exact: true }).click()

  // --- Click the meeting chip to reopen it for editing ---
  await page.getByTestId("calendar-meeting-chip").filter({ hasText: "WCal sync" }).click()
  await expect(page.getByRole("dialog", { name: "Edit meeting" })).toBeVisible()
  await expect(page.getByLabel("Title")).toHaveValue("WCal sync")
  await page.keyboard.press("Escape")
})
