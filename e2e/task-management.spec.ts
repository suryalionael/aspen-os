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
  // Asserts on actual Activity panel content (not just each mutation's own
  // success response) — see the labels test below for why this matters.
  await expect(page.getByText("Task created", { exact: false })).toBeVisible()
  await expect(
    page.getByText("Title changed to Renamed task", { exact: false })
  ).toBeVisible()
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

/**
 * Sprint 2 Phase A3: labels — create, attach/detach, and delete, scoped
 * per project (reusing the existing migration-007/010 RLS helpers).
 */
test("labels can be created, attached to a task, and removed", async ({ page }) => {
  const unique = Date.now()
  const email = `e2e-labels-${unique}@example.com`
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
  await quickAdd.fill("Task with labels")
  await quickAdd.press("Enter")
  await expect(page.getByText("Task with labels")).toBeVisible()

  await page.getByText("Task with labels").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()

  // Create a new label.
  await page.getByLabel("New label name").fill("Bug")
  await page.getByLabel("New label color").selectOption("red")
  const createPersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Add" }).click()
  await createPersisted

  // Attach it to the task.
  const labelChip = page.getByRole("button", { name: "Bug", exact: true })
  await expect(labelChip).toBeVisible()
  const attachPersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await labelChip.click()
  await attachPersisted

  await page.keyboard.press("Escape")
  // The chip now shows directly on the board card.
  await expect(page.getByTestId("task-card").getByText("Bug")).toBeVisible()

  // Detach it again from the dialog.
  await page.getByText("Task with labels").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  const detachPersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Bug", exact: true }).click()
  await detachPersisted

  // Asserts on actual Activity panel content, not just the mutation's own
  // success response — a missing GRANT on is_workspace_member_for_task
  // once let task_activity reads/writes fail silently (logActivity is
  // intentionally best-effort) while every other assertion still passed.
  await expect(page.getByText("Task created", { exact: false })).toBeVisible()
  await expect(page.getByText('Label "Bug" added', { exact: false })).toBeVisible()
  await expect(page.getByText('Label "Bug" removed', { exact: false })).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(page.getByTestId("task-card").getByText("Bug")).toHaveCount(0)
})
