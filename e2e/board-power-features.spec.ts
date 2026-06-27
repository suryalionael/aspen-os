import { test, expect, type Page } from "@playwright/test"

// Mirrors e2e/task-management.spec.ts's helper — lets the label/checklist
// panels' own mount-time fetches settle before a later action registers
// its own response listener.
async function waitForDialogSettled(page: Page) {
  await page.getByRole("button", { name: "Add label" }).waitFor({ state: "visible" })
  await page.getByRole("button", { name: "Add item" }).waitFor({ state: "visible" })
}

/**
 * Sprint 3 Phase J: Trello-power-feature additions on top of Sprint 2's
 * existing search/filter/sort (e2e/board-toolbar.spec.ts) — overdue due
 * dates, newest/oldest/assignee sort, full-text search across the
 * description too, and the "c"/"/"/Escape keyboard shortcuts.
 */
test("overdue indicator, newest/oldest/assignee sort, description search, and keyboard shortcuts", async ({
  page,
}) => {
  const unique = Date.now()
  const email = `e2e-power-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E Power Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()

  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))

  await page.getByRole("button", { name: "New" }).click()
  await page.getByLabel("Project name").fill(`E2E Power Project ${unique}`)
  await page.getByRole("button", { name: "Create project" }).click()
  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))

  // --- "c" focuses quick-add, even though no input is focused yet ---
  const quickAdd = page.getByPlaceholder("Add a task…")
  await quickAdd.waitFor({ state: "visible" })
  await page.getByRole("heading", { name: `E2E Power Project ${unique}` }).click()
  await page.keyboard.press("c")
  await expect(quickAdd).toBeFocused()
  for (const title of ["First task", "Second task", "Third task"]) {
    await quickAdd.fill(title)
    await quickAdd.press("Enter")
    await expect(page.getByText(title)).toBeVisible()
  }

  // --- "/" focuses the search box (after blurring the quick-add field) ---
  await page.keyboard.press("Escape")
  await quickAdd.blur()
  await page.keyboard.press("/")
  await expect(page.getByLabel("Search tasks")).toBeFocused()
  await page.getByLabel("Search tasks").fill("")

  // --- Give "First task" a description, "Second task" an overdue due
  // date, and "Third task" a future due date + assignee ---
  await page.getByText("First task").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)
  await page.getByLabel("Description").fill("Contains a unique searchable phrase: zephyr")
  let savePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await savePersisted
  // Escaping immediately after the network response can race ahead of
  // React committing useActionState's result and running the effect that
  // propagates it up to the board (confirmed directly: closing on the
  // network response alone is flaky, closing after the Activity panel
  // shows the edit — which only renders after that same effect commits —
  // is not).
  await expect(page.getByText("Description changed", { exact: false })).toBeVisible()
  await page.keyboard.press("Escape")

  await page.getByText("Second task").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)
  await page.getByLabel("Due date").fill("2020-01-01")
  savePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await savePersisted
  await expect(page.getByText("Due date changed", { exact: false })).toBeVisible()
  await page.keyboard.press("Escape")

  await page.getByText("Third task").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)
  await page.getByLabel("Due date").fill("2099-01-01")
  await page.getByLabel("Assignee").selectOption({ label: email })
  savePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await savePersisted
  await expect(page.getByText("Due date changed", { exact: false })).toBeVisible()
  await page.keyboard.press("Escape")

  // --- Overdue indicator: only the past-dated, non-done task shows it.
  // Verified via each card's own rendered text (not the dialog's
  // uncontrolled input, which only reflects new state on remount) — the
  // same pattern e2e/task-management.spec.ts already relies on. ---
  await expect(
    page.getByTestId("task-card").filter({ hasText: "Second task" }).getByText("Overdue", { exact: false })
  ).toBeVisible()
  await expect(
    page.getByTestId("task-card").filter({ hasText: "Third task" }).getByText("Overdue", { exact: false })
  ).toHaveCount(0)

  // --- Full-text search matches the description, not just the title ---
  await page.getByLabel("Search tasks").fill("zephyr")
  await expect(page.getByTestId("task-card")).toHaveCount(1)
  await expect(page.getByText("First task")).toBeVisible()
  await page.getByLabel("Search tasks").fill("")
  await expect(page.getByTestId("task-card")).toHaveCount(3)

  // --- Sort by assignee: the assigned task sorts before unassigned ones ---
  await page.getByLabel("Sort tasks").selectOption("assignee")
  await expect(page.getByTestId("task-card").first()).toContainText("Third task")

  // --- Sort by newest: most recently created task first ---
  await page.getByLabel("Sort tasks").selectOption("newest")
  await expect(page.getByTestId("task-card").first()).toContainText("Third task")
  await expect(page.getByTestId("task-card").last()).toContainText("First task")

  // --- Sort by oldest: reverse of newest ---
  await page.getByLabel("Sort tasks").selectOption("oldest")
  await expect(page.getByTestId("task-card").first()).toContainText("First task")
  await expect(page.getByTestId("task-card").last()).toContainText("Third task")
})
