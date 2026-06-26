import { test, expect } from "@playwright/test"

/**
 * Sprint 2 Phase A1: task detail dialog — edit, archive/restore, and
 * delete. Follows the same conventions as e2e/kanban.spec.ts (unique test
 * data per run via Date.now(), response listeners registered before the
 * action that triggers them, route assertions before each interaction).
 */
test("edit, archive/restore, and delete all work from the task detail dialog", async ({
  page,
}) => {
  const unique = Date.now()
  const email = `e2e-taskmgmt-${unique}@example.com`
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
  await quickAdd.fill("Task to manage")
  await quickAdd.press("Enter")
  await expect(page.getByText("Task to manage")).toBeVisible()

  // --- Open the detail dialog by clicking the card's title ---
  await page.getByText("Task to manage").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()

  // --- Edit: rename the task and confirm the card updates ---
  const titleInput = page.getByLabel("Title")
  await titleInput.fill("Renamed task")
  const editPersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Save" }).click()
  await editPersisted
  await page.keyboard.press("Escape")

  await expect(page.getByText("Renamed task")).toBeVisible()
  await expect(page.getByText("Task to manage")).toHaveCount(0)

  // --- Archive: the task should disappear from the board ---
  await page.getByText("Renamed task").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  const archivePersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Archive" }).click()
  await archivePersisted
  await expect(page.getByText("Renamed task")).toHaveCount(0)

  // --- Restore from the Archived dialog and confirm it reappears ---
  await page.getByRole("button", { name: "Archived" }).click()
  await expect(page.getByText("Renamed task")).toBeVisible()
  const restorePersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Restore" }).click()
  await restorePersisted
  await page.keyboard.press("Escape")
  await expect(
    page.getByTestId("column-todo").getByText("Renamed task")
  ).toBeVisible()

  // --- Delete: requires a second confirming click, then is gone for good ---
  await page.getByText("Renamed task").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  const deletePersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Confirm delete" }).click()
  await deletePersisted
  await expect(page.getByText("Renamed task")).toHaveCount(0)

  await page.getByRole("button", { name: "Archived" }).click()
  await expect(page.getByText("No archived tasks")).toBeVisible()
})

/**
 * Sprint 2 Phase A2: description (Markdown), due date, and priority,
 * edited together in the same detail-dialog form as the title.
 */
test("description, due date, and priority can be set and show on the card", async ({
  page,
}) => {
  const unique = Date.now()
  const email = `e2e-taskfields-${unique}@example.com`
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
  await quickAdd.fill("Task with fields")
  await quickAdd.press("Enter")
  await expect(page.getByText("Task with fields")).toBeVisible()

  await page.getByText("Task with fields").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()

  await page.getByLabel("Description").fill("**Important** details here")
  // The live Markdown preview renders the bold text without the ** markers.
  await expect(page.getByText("Important details here")).toBeVisible()

  await page.getByLabel("Due date").fill("2026-12-31")
  await page.getByLabel("Priority").selectOption("urgent")

  const savePersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Save" }).click()
  await savePersisted
  await page.keyboard.press("Escape")

  // The card itself shows the priority badge and due date without
  // needing to reopen the dialog.
  await expect(page.getByText("Urgent")).toBeVisible()
  await expect(page.getByText("Due 12/31/2026")).toBeVisible()

  // Reopening confirms the fields persisted server-side, not just in the
  // optimistic client state.
  await page.reload()
  await page.getByText("Task with fields").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await expect(page.getByLabel("Description")).toHaveValue("**Important** details here")
  await expect(page.getByLabel("Due date")).toHaveValue("2026-12-31")
  await expect(page.getByLabel("Priority")).toHaveValue("urgent")
})
