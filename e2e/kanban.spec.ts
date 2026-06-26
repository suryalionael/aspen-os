import { test, expect } from "@playwright/test"

/**
 * End-to-end verification of the complete Sprint 1 loop through Phase 6:
 * sign up -> workspace -> project -> task -> move (T45, AC-5), covering
 * both the drag-and-drop path and the keyboard-accessible "Move to…"
 * fallback (DEC-016 / audit X-1), and confirming both persist after a
 * full page reload.
 *
 * Requires a real Supabase project with email confirmation disabled
 * (DEC-014) — same prerequisite as the data-layer scripts.
 */
test("drag-and-drop and keyboard fallback both move a task, and both persist after reload", async ({
  page,
}) => {
  const unique = Date.now()
  const email = `e2e-kanban-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()

  // Redirected into the new (single-segment) workspace URL.
  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))

  await page.getByRole("button", { name: "New" }).click()
  await page.getByLabel("Project name").fill(`E2E Project ${unique}`)
  await page.getByRole("button", { name: "Create project" }).click()

  // Redirected to the project's (two-segment) Kanban board URL.
  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))

  const quickAdd = page.getByPlaceholder("Add a task…")

  await quickAdd.fill("Drag me to In Progress")
  await quickAdd.press("Enter")
  await expect(page.getByText("Drag me to In Progress")).toBeVisible()

  await quickAdd.fill("Move me with the keyboard")
  await quickAdd.press("Enter")
  await expect(page.getByText("Move me with the keyboard")).toBeVisible()

  // --- Drag-and-drop path: drag the first task into "In Progress" ---
  const dragCard = page
    .getByTestId("task-card")
    .filter({ hasText: "Drag me to In Progress" })
  const inProgressColumn = page.getByTestId("column-in_progress")

  const sourceBox = await dragCard.boundingBox()
  const targetBox = await inProgressColumn.boundingBox()
  if (!sourceBox || !targetBox) {
    throw new Error("Could not measure drag source/target bounding boxes")
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2
  )
  await page.mouse.down()
  // Small initial move to clear dnd-kit's activation distance constraint
  // before moving toward the target — a single jump can be missed.
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 10,
    sourceBox.y + 10,
    { steps: 5 }
  )
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 10 }
  )
  await page.mouse.up()

  await expect(
    page.getByTestId("column-in_progress").getByText("Drag me to In Progress")
  ).toBeVisible()

  // --- Keyboard fallback path: the "Move to" select, not drag ---
  const keyboardCard = page
    .getByTestId("task-card")
    .filter({ hasText: "Move me with the keyboard" })
  await keyboardCard.getByLabel("Move task to column").selectOption("done")

  await expect(
    page.getByTestId("column-done").getByText("Move me with the keyboard")
  ).toBeVisible()

  // --- AC-5: reload and confirm both moves persisted in the database ---
  await page.reload()
  await expect(
    page.getByTestId("column-in_progress").getByText("Drag me to In Progress")
  ).toBeVisible()
  await expect(
    page.getByTestId("column-done").getByText("Move me with the keyboard")
  ).toBeVisible()
})
