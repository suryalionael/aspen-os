import { test, expect, type Page } from "@playwright/test"

async function waitForDialogSettled(page: Page) {
  await page.getByRole("button", { name: "Add label" }).waitFor({ state: "visible" })
  await page.getByRole("button", { name: "Add item" }).waitFor({ state: "visible" })
}

/**
 * Sprint 3 Phase N: a workspace-wide audit log (migration 028, DEC-032)
 * that's a superset of task_activity — it survives a task being deleted
 * (task_activity cascades away with it) and covers non-task events
 * (invitations, role changes, project/workspace renames). Covers a
 * representative trigger from each subsystem, plus filtering and export.
 */
test("audit log records task/project/workspace/membership events, survives task deletion, and supports filtering + export", async ({
  browser,
}) => {
  test.setTimeout(60_000)

  const unique = Date.now()
  const password = "TestPassword123!"

  const ownerPage = await (await browser.newContext()).newPage()
  const memberPage = await (await browser.newContext()).newPage()

  const ownerEmail = `e2e-audit-owner-${unique}@example.com`
  const memberEmail = `e2e-audit-member-${unique}@example.com`

  async function signUp(page: Page, email: string) {
    await page.goto("/sign-up")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Create account" }).click()
    await page.waitForURL("**/workspaces/new")
  }

  await signUp(ownerPage, ownerEmail)
  await ownerPage.getByLabel("Workspace name").fill(`Audit Workspace ${unique}`)
  await ownerPage.getByRole("button", { name: "Create workspace" }).click()
  await ownerPage.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  const workspacePath = new URL(ownerPage.url()).pathname

  // --- invitation.created + invitation.accepted ---
  await ownerPage.getByRole("button", { name: "Members" }).click()
  await ownerPage.getByRole("button", { name: "Create invite link" }).click()
  const linkText = await ownerPage.locator("p", { hasText: "/invite/" }).first().textContent()
  const inviteUrl = new URL(linkText!.trim())
  await ownerPage.keyboard.press("Escape")

  await signUp(memberPage, memberEmail)
  await memberPage.goto(inviteUrl.pathname)
  await memberPage.getByRole("button", { name: "Accept" }).click()
  await memberPage.waitForURL((url) => url.pathname === workspacePath)

  // --- member.role_changed ---
  await ownerPage.reload()
  await ownerPage.getByRole("button", { name: "Members" }).click()
  const memberRow = ownerPage.getByTestId("member-row").filter({ hasText: memberEmail })
  const rolePersisted = ownerPage.waitForResponse((resp) => resp.request().method() === "POST")
  await memberRow.getByRole("button", { name: "Make admin" }).click()
  await rolePersisted
  await ownerPage.keyboard.press("Escape")

  // --- project.renamed ---
  await ownerPage.getByRole("button", { name: "New" }).click()
  await ownerPage.getByLabel("Project name").fill(`Audit Project ${unique}`)
  await ownerPage.getByRole("button", { name: "Create project" }).click()
  await ownerPage.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))
  await ownerPage.getByRole("button", { name: "Project settings" }).click()
  await ownerPage.getByLabel("Name").fill(`Renamed Audit Project ${unique}`)
  const renamePersisted = ownerPage.waitForResponse((resp) => resp.request().method() === "POST")
  await ownerPage.getByRole("button", { name: "Save", exact: true }).click()
  await renamePersisted
  await ownerPage.keyboard.press("Escape")

  // --- task.created + task.commented + task.deleted ---
  const quickAdd = ownerPage.getByPlaceholder("Add a task…")
  await quickAdd.fill("Audited task")
  await quickAdd.press("Enter")
  await expect(ownerPage.getByText("Audited task")).toBeVisible()

  await ownerPage.getByTestId("task-card").getByText("Audited task").click()
  await expect(ownerPage.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(ownerPage)
  await ownerPage.getByLabel("New comment").fill("A comment to audit")
  const commentPersisted = ownerPage.waitForResponse((resp) => resp.request().method() === "POST")
  await ownerPage.getByRole("button", { name: "Comment" }).click()
  await commentPersisted
  await ownerPage.getByRole("button", { name: "Delete", exact: true }).click()
  const deletePersisted = ownerPage.waitForResponse((resp) => resp.request().method() === "POST")
  await ownerPage.getByRole("button", { name: "Confirm delete" }).click()
  await deletePersisted

  // --- workspace.renamed ---
  await ownerPage.getByRole("button", { name: "Workspace settings" }).click()
  await ownerPage.getByLabel("Name").fill(`Renamed Audit Workspace ${unique}`)
  const wsRenamePersisted = ownerPage.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await ownerPage.getByRole("button", { name: "Save" }).click()
  await wsRenamePersisted
  await ownerPage.keyboard.press("Escape")

  // --- Open the audit log and confirm every event above is present,
  // including the deleted task's events (proving they survive the
  // task_activity cascade) ---
  await ownerPage.getByRole("button", { name: "Audit log" }).click()
  await expect(ownerPage.getByRole("dialog", { name: "Audit log" })).toBeVisible()

  const entries = ownerPage.getByTestId("audit-log-entry")
  await expect(entries.filter({ hasText: "Invitation created" })).toBeVisible()
  await expect(entries.filter({ hasText: "Invitation accepted" })).toBeVisible()
  await expect(entries.filter({ hasText: "Role changed" })).toBeVisible()
  await expect(entries.filter({ hasText: "Project renamed" })).toBeVisible()
  await expect(entries.filter({ hasText: "Task created" })).toBeVisible()
  await expect(entries.filter({ hasText: "Task commented" })).toBeVisible()
  await expect(entries.filter({ hasText: "Task deleted" })).toBeVisible()
  await expect(entries.filter({ hasText: "Workspace renamed" })).toBeVisible()

  // --- Filter by action narrows the list ---
  await ownerPage.getByLabel("Action").selectOption({ label: "Task deleted" })
  await ownerPage.getByRole("button", { name: "Filter" }).click()
  await expect(ownerPage.getByTestId("audit-log-entry")).toHaveCount(1)
  await expect(ownerPage.getByTestId("audit-log-entry")).toContainText("task deleted")

  // --- Filter by user (the owner) still includes their own entries ---
  await ownerPage.getByLabel("Action").selectOption({ label: "Any action" })
  await ownerPage.getByLabel("User").selectOption({ label: ownerEmail })
  await ownerPage.getByRole("button", { name: "Filter" }).click()
  await expect(ownerPage.getByTestId("audit-log-entry").first()).toBeVisible()

  // --- Export as CSV ---
  const [csvDownload] = await Promise.all([
    ownerPage.waitForEvent("download"),
    ownerPage.getByRole("button", { name: "Export CSV" }).click(),
  ])
  expect(csvDownload.suggestedFilename()).toContain(".csv")
})
