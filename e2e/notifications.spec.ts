import { test, expect, type Page } from "@playwright/test"

async function waitForDialogSettled(page: Page) {
  await page.getByRole("button", { name: "Add label" }).waitFor({ state: "visible" })
  await page.getByRole("button", { name: "Add item" }).waitFor({ state: "visible" })
}

/**
 * Sprint 3 Phase K: a persisted notification center (DEC-029 revisits
 * DEC-022's deferral). Covers each trigger — assigned, commented,
 * checklist_completed, due_today — plus the unread badge, mark read, and
 * mark all read.
 */
test("notifications fire for assignment, comments, checklist completion, and due-today, with working read state", async ({
  browser,
}) => {
  const unique = Date.now()
  const password = "TestPassword123!"

  const ownerPage = await (await browser.newContext()).newPage()
  const memberPage = await (await browser.newContext()).newPage()

  const ownerEmail = `e2e-notif-owner-${unique}@example.com`
  const memberEmail = `e2e-notif-member-${unique}@example.com`

  async function signUp(page: Page, email: string) {
    await page.goto("/sign-up")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Create account" }).click()
    await page.waitForURL("**/workspaces/new")
  }

  await signUp(ownerPage, ownerEmail)
  await ownerPage.getByLabel("Workspace name").fill(`Notif Workspace ${unique}`)
  await ownerPage.getByRole("button", { name: "Create workspace" }).click()
  await ownerPage.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  const workspacePath = new URL(ownerPage.url()).pathname

  await ownerPage.getByRole("button", { name: "Members" }).click()
  await ownerPage.getByRole("button", { name: "Create invite link" }).click()
  const linkText = await ownerPage.locator("p", { hasText: "/invite/" }).first().textContent()
  const inviteUrl = new URL(linkText!.trim())
  await ownerPage.keyboard.press("Escape")

  await signUp(memberPage, memberEmail)
  await memberPage.goto(inviteUrl.pathname)
  await memberPage.getByRole("button", { name: "Accept" }).click()
  await memberPage.waitForURL((url) => url.pathname === workspacePath)

  await ownerPage.getByRole("button", { name: "New" }).click()
  await ownerPage.getByLabel("Project name").fill(`Notif Project ${unique}`)
  await ownerPage.getByRole("button", { name: "Create project" }).click()
  await ownerPage.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))
  const projectUrl = ownerPage.url()

  const quickAdd = ownerPage.getByPlaceholder("Add a task…")
  await quickAdd.fill("Shared task")
  await quickAdd.press("Enter")
  await expect(ownerPage.getByText("Shared task")).toBeVisible()

  // --- Owner assigns the task to the member: "assigned" notification ---
  await ownerPage.getByTestId("task-card").getByText("Shared task").click()
  await expect(ownerPage.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(ownerPage)
  await ownerPage.getByLabel("Assignee").selectOption({ label: memberEmail })
  let savePersisted = ownerPage.waitForResponse((resp) => resp.request().method() === "POST")
  await ownerPage.getByRole("button", { name: "Save" }).click()
  await savePersisted
  await expect(ownerPage.getByText("Assignee changed", { exact: false })).toBeVisible()
  await ownerPage.keyboard.press("Escape")

  await memberPage.goto(projectUrl)
  await memberPage.getByRole("button", { name: "Notifications" }).click()
  await expect(memberPage.getByRole("dialog", { name: "Notifications" })).toBeVisible()
  await expect(
    memberPage.getByTestId("notification-item").filter({ hasText: "Assigned" })
  ).toBeVisible()
  await expect(memberPage.getByTestId("unread-badge")).toHaveText("1")
  await memberPage.keyboard.press("Escape")

  // --- Owner comments on the task (member is the assignee): "commented" ---
  await ownerPage.getByTestId("task-card").getByText("Shared task").click()
  await expect(ownerPage.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(ownerPage)
  await ownerPage.getByLabel("New comment").fill("Looks good")
  savePersisted = ownerPage.waitForResponse((resp) => resp.request().method() === "POST")
  await ownerPage.getByRole("button", { name: "Comment" }).click()
  await savePersisted
  await ownerPage.keyboard.press("Escape")

  await memberPage.reload()
  await memberPage.getByRole("button", { name: "Notifications" }).click()
  await expect(memberPage.getByRole("dialog", { name: "Notifications" })).toBeVisible()
  await expect(
    memberPage.getByTestId("notification-item").filter({ hasText: "Comment" })
  ).toBeVisible()
  await expect(memberPage.getByTestId("unread-badge")).toHaveText("2")

  // --- Mark one notification read: badge drops to 1 ---
  await memberPage
    .getByTestId("notification-item")
    .filter({ hasText: "Assigned" })
    .click()
  await expect(memberPage.getByTestId("unread-badge")).toHaveText("1")
  await memberPage.keyboard.press("Escape")

  // --- Member completes the checklist (owner is the creator): notifies owner ---
  await memberPage.goto(projectUrl)
  await memberPage.getByTestId("task-card").getByText("Shared task").click()
  await expect(memberPage.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(memberPage)
  await memberPage.getByLabel("New checklist item").fill("Step one")
  await memberPage.getByRole("button", { name: "Add item" }).click()
  await expect(memberPage.getByTestId("checklist-item")).toHaveCount(1)
  const checklistPersisted = memberPage.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await memberPage.getByRole("checkbox").first().check()
  await checklistPersisted
  await memberPage.keyboard.press("Escape")

  await ownerPage.reload()
  await ownerPage.getByRole("button", { name: "Notifications" }).click()
  await expect(ownerPage.getByRole("dialog", { name: "Notifications" })).toBeVisible()
  await expect(
    ownerPage.getByTestId("notification-item").filter({ hasText: "Checklist" })
  ).toBeVisible()

  // --- "Mark all read" clears the badge entirely ---
  await ownerPage.getByRole("button", { name: "Mark all read" }).click()
  await expect(ownerPage.getByTestId("unread-badge")).toHaveCount(0)
  await ownerPage.keyboard.press("Escape")

  // --- Due today: member sets the task's due date to today, then the
  // bell's own load (checkDueTodayNotifications) generates the entry ---
  await memberPage.goto(projectUrl)
  await memberPage.getByTestId("task-card").getByText("Shared task").click()
  await expect(memberPage.getByRole("dialog", { name: "Task details" })).toBeVisible()
  await waitForDialogSettled(memberPage)
  const today = new Date().toISOString().slice(0, 10)
  await memberPage.getByLabel("Due date").fill(today)
  savePersisted = memberPage.waitForResponse((resp) => resp.request().method() === "POST")
  await memberPage.getByRole("button", { name: "Save" }).click()
  await savePersisted
  await expect(memberPage.getByText("Due date changed", { exact: false })).toBeVisible()
  await memberPage.keyboard.press("Escape")

  await memberPage.reload()
  await memberPage.getByRole("button", { name: "Notifications" }).click()
  await expect(memberPage.getByRole("dialog", { name: "Notifications" })).toBeVisible()
  await expect(
    memberPage.getByTestId("notification-item").filter({ hasText: "Due today" })
  ).toBeVisible()
})
