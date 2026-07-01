import path from "node:path"

import { test, expect, type Page } from "@playwright/test"

// The task detail dialog's child components (labels, checklist) each fetch
// their own data once on mount, firing POST requests that can otherwise
// race a test's own waitForResponse for a subsequent action. Waiting for
// their loaded-state buttons to appear lets those mount-time fetches
// settle before any later action registers its own response listener.
async function waitForDialogSettled(page: Page) {
  await page.getByRole("button", { name: "Add label" }).waitFor({ state: "visible" })
  await page.getByRole("button", { name: "Add item" }).waitFor({ state: "visible" })
}

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
  await waitForDialogSettled(page)

  // --- Edit: rename the task and confirm the card updates ---
  const titleInput = page.getByLabel("Title")
  await titleInput.fill("Renamed task")
  const editPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await editPersisted
  await page.keyboard.press("Escape")

  // Scope to the kanban card to avoid a false strict-mode collision with the
  // "Task updated: Renamed task" toast that the board's real-time subscription
  // fires simultaneously.
  await expect(page.getByTestId("task-card").getByText("Renamed task")).toBeVisible()
  await expect(page.getByText("Task to manage")).toHaveCount(0)

  // --- Archive: the task should disappear from the board ---
  await page.getByTestId("task-card").getByText("Renamed task").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)
  // Asserts on actual Activity panel content (not just each mutation's own
  // success response) — see the labels test below for why this matters.
  await expect(page.getByText("Task created", { exact: false })).toBeVisible()
  await expect(
    page.getByText("Title changed to Renamed task", { exact: false })
  ).toBeVisible()
  const archivePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Archive" }).click()
  await archivePersisted
  await expect(page.getByText("Renamed task")).toHaveCount(0)

  // --- Restore from the Archived dialog and confirm it reappears ---
  await page.getByRole("button", { name: "Archived", exact: true }).click()
  await expect(page.getByTestId("archived-task-row").getByText("Renamed task")).toBeVisible()
  const restorePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Restore" }).click()
  await restorePersisted
  await page.keyboard.press("Escape")
  await expect(
    page.getByTestId("column-todo").getByText("Renamed task")
  ).toBeVisible()

  // --- Delete: requires a second confirming click, then is gone for good ---
  await page.getByTestId("task-card").getByText("Renamed task").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  const deletePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Confirm delete" }).click()
  await deletePersisted
  await expect(page.getByText("Renamed task")).toHaveCount(0)

  await page.getByRole("button", { name: "Archived", exact: true }).click()
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
  await waitForDialogSettled(page)

  await page.getByLabel("Description").fill("**Important** details here")
  // The live Markdown preview renders the bold text without the ** markers.
  await expect(page.getByText("Important details here")).toBeVisible()

  await page.getByLabel("Due date").fill("2026-12-31")
  await page.getByRole("dialog").getByLabel("Priority").selectOption("urgent")

  const savePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await savePersisted
  await page.keyboard.press("Escape")

  // The card itself shows the priority badge and due date without
  // needing to reopen the dialog.
  await expect(page.getByTestId("task-card").getByText("Urgent")).toBeVisible()
  await expect(page.getByText("Due 12/31/2026")).toBeVisible()

  // Reopening confirms the fields persisted server-side, not just in the
  // optimistic client state.
  await page.reload()
  await page.getByText("Task with fields").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)
  await expect(page.getByLabel("Description")).toHaveValue("**Important** details here")
  await expect(page.getByLabel("Due date")).toHaveValue("2026-12-31")
  await expect(page.getByRole("dialog").getByLabel("Priority")).toHaveValue("urgent")
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
  await waitForDialogSettled(page)

  // Create a new label.
  await page.getByLabel("New label name").fill("Bug")
  await page.getByLabel("New label color").selectOption("red")
  const createPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Add label" }).click()
  await createPersisted

  // Attach it to the task.
  const labelChip = page.getByRole("button", { name: "Bug", exact: true })
  await expect(labelChip).toBeVisible()
  const attachPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await labelChip.click()
  await attachPersisted

  await page.keyboard.press("Escape")
  // The chip now shows directly on the board card.
  await expect(page.getByTestId("task-card").getByText("Bug")).toBeVisible()

  // Detach it again from the dialog.
  await page.getByText("Task with labels").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)
  const detachPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
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

/**
 * Sprint 2 Phase A4: a single implicit checklist per task — add, check
 * off, and remove items, with a live progress count on the board card.
 */
test("checklist items can be added, checked off, and removed", async ({ page }) => {
  const unique = Date.now()
  const email = `e2e-checklist-${unique}@example.com`
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
  await quickAdd.fill("Task with checklist")
  await quickAdd.press("Enter")
  await expect(page.getByText("Task with checklist")).toBeVisible()

  await page.getByText("Task with checklist").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)

  const newItemInput = page.getByLabel("New checklist item")
  await newItemInput.fill("Write tests")
  const addPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await newItemInput.press("Enter")
  await addPersisted
  await expect(
    page.getByTestId("checklist-item").getByText("Write tests")
  ).toBeVisible()

  await newItemInput.fill("Ship it")
  const addPersisted2 = page.waitForResponse((resp) => resp.request().method() === "POST")
  await newItemInput.press("Enter")
  await addPersisted2
  await expect(
    page.getByTestId("checklist-item").getByText("Ship it")
  ).toBeVisible()

  // Board card shows progress without needing to reopen the dialog.
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("task-card").getByText("0/2")).toBeVisible()

  // Check one off and confirm the count updates live, plus an activity entry.
  await page.getByText("Task with checklist").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)
  const checkPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByLabel('Mark "Write tests" as done').check()
  await checkPersisted
  await expect(
    page.getByText('Checked off "Write tests"', { exact: false })
  ).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(page.getByTestId("task-card").getByText("1/2")).toBeVisible()

  // Remove an item and confirm the count drops accordingly.
  await page.getByText("Task with checklist").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)
  const deletePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByLabel('Delete "Ship it"').click()
  await deletePersisted
  await expect(page.getByTestId("checklist-item").getByText("Ship it")).toHaveCount(0)

  await page.keyboard.press("Escape")
  await expect(page.getByTestId("task-card").getByText("1/1")).toBeVisible()
})

/**
 * Sprint 2 Phase A5: comments — add, edit, and delete, with a live count
 * on the board card. RLS additionally requires author_id = auth.uid() for
 * update/delete (migration 016), distinct from the membership-only
 * gating used by labels/checklist/task_activity.
 */
test("comments can be added, edited, and deleted", async ({ page }) => {
  const unique = Date.now()
  const email = `e2e-comments-${unique}@example.com`
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
  await quickAdd.fill("Task with comments")
  await quickAdd.press("Enter")
  await expect(page.getByText("Task with comments")).toBeVisible()

  await page.getByText("Task with comments").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)

  const newComment = page.getByLabel("New comment")
  await newComment.fill("First comment")
  const addPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Comment", exact: true }).click()
  await addPersisted
  await expect(
    page.getByTestId("comment-item").getByText("First comment")
  ).toBeVisible()
  await expect(page.getByText("New comment", { exact: false })).toBeVisible()

  // Board card shows the comment count without needing to reopen.
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("task-card").getByText("💬 1")).toBeVisible()

  // Edit it.
  await page.getByText("Task with comments").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await page.getByRole("button", { name: "Edit comment" }).click()
  await page.getByLabel("Edit comment").fill("First comment, edited")
  const editPersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Save comment" }).click()
  await editPersisted
  await expect(
    page.getByTestId("comment-item").getByText("First comment, edited")
  ).toBeVisible()
  await expect(page.getByText("(edited)")).toBeVisible()

  // Delete it and confirm the card's count drops back to zero (no badge).
  const deletePersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Delete comment" }).click()
  await deletePersisted
  await expect(page.getByTestId("comment-item")).toHaveCount(0)

  await page.keyboard.press("Escape")
  await expect(
    page.getByTestId("task-card").getByText("💬", { exact: false })
  ).toHaveCount(0)
})

/**
 * Sprint 2 Phase H: file attachments, stored in the private
 * "task-attachments" Storage bucket (migration 022) and listed via
 * signed URLs rather than a public path.
 */
test("attachments can be uploaded and removed", async ({ page }) => {
  const unique = Date.now()
  const email = `e2e-attachments-${unique}@example.com`
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
  await quickAdd.fill("Task with attachments")
  await quickAdd.press("Enter")
  await expect(page.getByText("Task with attachments")).toBeVisible()

  await page.getByText("Task with attachments").click()
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(page)

  const uploadPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page
    .getByLabel("Attachment")
    .setInputFiles(path.join(__dirname, "..", "app", "icon.png"))
  await uploadPersisted

  const attachmentItem = page.getByTestId("attachment-item")
  await expect(attachmentItem.getByText("icon.png")).toBeVisible()
  await expect(
    page.getByText('Attachment "icon.png" added', { exact: false })
  ).toBeVisible()

  // The link is a real signed URL into the private bucket, not a bare path.
  const href = await attachmentItem.getByRole("link", { name: "icon.png" }).getAttribute("href")
  expect(href).toContain("task-attachments")

  const deletePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: 'Delete "icon.png"' }).click()
  await deletePersisted
  await expect(page.getByTestId("attachment-item")).toHaveCount(0)
  await expect(
    page.getByText('Attachment "icon.png" removed', { exact: false })
  ).toBeVisible()
})
