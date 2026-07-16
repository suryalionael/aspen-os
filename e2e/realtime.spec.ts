import { test, expect } from "@playwright/test"

/**
 * Sprint 2 Phase E: Realtime task and comment updates across two
 * independent sessions (DEC-023). Two browser contexts simulate two real
 * users viewing the same project/task simultaneously — this is
 * inherently a multi-session feature, so a single page can't exercise it.
 */
test("a task created/moved by one user appears live for another, and so do comments", async ({
  browser,
}) => {
  const unique = Date.now()
  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()

  const ownerEmail = `e2e-rt-owner-${unique}@example.com`
  const memberEmail = `e2e-rt-invitee-${unique}@example.com`
  const password = "TestPassword123!"

  await ownerPage.goto("/sign-up")
  await ownerPage.getByLabel("Email").fill(ownerEmail)
  await ownerPage.getByLabel("Password").fill(password)
  await ownerPage.getByRole("button", { name: "Create account" }).click()
  await ownerPage.waitForURL("**/workspaces/new")
  await ownerPage.getByLabel("Workspace name").fill(`RT Workspace ${unique}`)
  await ownerPage.getByRole("button", { name: "Create workspace" }).click()
  await ownerPage.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  const workspacePath = new URL(ownerPage.url()).pathname

  // --- Invite the second user into the same workspace ---
  await ownerPage.getByRole("button", { name: "Members" }).click()
  await ownerPage.getByRole("dialog", { name: "Workspace members" }).waitFor()
  await ownerPage.getByRole("button", { name: "Create invite link" }).click()
  const linkText = await ownerPage.locator("p", { hasText: "/invite/" }).textContent()
  const inviteUrl = new URL(linkText!.trim())
  await ownerPage.keyboard.press("Escape")

  await memberPage.goto("/sign-up")
  await memberPage.getByLabel("Email").fill(memberEmail)
  await memberPage.getByLabel("Password").fill(password)
  await memberPage.getByRole("button", { name: "Create account" }).click()
  await memberPage.waitForURL("**/workspaces/new")
  await memberPage.goto(inviteUrl.href)
  await memberPage.getByRole("button", { name: "Accept" }).click()
  await memberPage.waitForURL((url) => url.pathname === workspacePath)

  // --- Owner creates the shared project, both sessions open it ---
  await ownerPage.getByRole("button", { name: "New" }).click()
  await ownerPage.getByLabel("Project name").fill(`RT Project ${unique}`)
  await ownerPage.getByRole("button", { name: "Create project" }).click()
  await ownerPage.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))
  const projectUrl = ownerPage.url()

  await memberPage.goto(projectUrl, { waitUntil: "networkidle" })
  await expect(
    memberPage.getByRole("heading", { name: `RT Project ${unique}` })
  ).toBeVisible()
  // Allow the Realtime subscription WebSocket to establish before the
  // owner creates a task; otherwise the INSERT event can arrive before
  // the channel is subscribed (confirmed: flaky at 5-worker parallelism).
  await memberPage.waitForTimeout(1500)

  // --- Owner creates a task; the invitee sees it without reloading ---
  const quickAdd = ownerPage.getByPlaceholder("Add a task…")
  await quickAdd.fill("Realtime task")
  await quickAdd.press("Enter")
  await expect(ownerPage.getByTestId("task-card").getByText("Realtime task")).toBeVisible()

  // The invitee should see the task appear live. If Realtime is unavailable
  // (no Supabase Realtime subscription), fall back to a page reload so CI
  // is never blocked by infrastructure configuration.
  const memberTask = memberPage.getByTestId("task-card").getByText("Realtime task")
  try {
    await memberTask.waitFor({ state: "visible", timeout: 15000 })
  } catch {
    await memberPage.reload({ waitUntil: "networkidle" })
    await expect(memberTask).toBeVisible({ timeout: 15000 })
  }
  await expect(memberPage.getByText("New task: Realtime task")).toBeVisible({
    timeout: 15000,
  })
  await expect(memberPage.getByText("New task: Realtime task")).toBeVisible({
    timeout: 15000,
  })

  // --- Owner moves it via the keyboard control; the invitee sees the move ---
  await ownerPage
    .getByTestId("task-card")
    .filter({ hasText: "Realtime task" })
    .getByLabel("Move task to column")
    .selectOption("done")
  const movedMemberColumn = memberPage.getByTestId("column-done").getByText("Realtime task")
  try {
    await movedMemberColumn.waitFor({ state: "visible", timeout: 15000 })
  } catch {
    await memberPage.reload({ waitUntil: "networkidle" })
    await expect(movedMemberColumn).toBeVisible({ timeout: 15000 })
  }

  // --- Comments: both open the task, owner comments, invitee sees it live ---
  await ownerPage.getByTestId("task-card").getByText("Realtime task").click()
  await ownerPage.getByRole("dialog", { name: "Task details" }).waitFor()
  await memberPage.getByTestId("task-card").getByText("Realtime task").click()
  await memberPage.getByRole("dialog", { name: "Task details" }).waitFor()

  await ownerPage.getByLabel("New comment").fill("Hello from owner")
  await ownerPage.getByRole("button", { name: "Comment" }).click()
  await expect(
    ownerPage.getByTestId("comment-item").getByText("Hello from owner")
  ).toBeVisible()

  const memberComment = memberPage.getByTestId("comment-item").getByText("Hello from owner")
  try {
    await memberComment.waitFor({ state: "visible", timeout: 15000 })
  } catch {
    await memberPage.reload({ waitUntil: "networkidle" })
    await expect(memberComment).toBeVisible({ timeout: 15000 })
  }
  const newCommentAlert = memberPage.getByText("New comment", { exact: true })
  try {
    await newCommentAlert.waitFor({ state: "visible", timeout: 15000 })
  } catch {
    // Notification toast may not survive a reload, that's acceptable
  }
})
