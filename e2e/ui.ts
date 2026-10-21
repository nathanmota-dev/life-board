import { expect, type Page, type Locator } from "@playwright/test"

export async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click()
  await page.getByRole("option", { name: option, exact: true }).click()
  await expect(async () => {
    const listbox = page.getByRole("listbox")
    if (await listbox.count()) await page.keyboard.press("Escape")
    await expect(listbox).toHaveCount(0, { timeout: 500 })
  }).toPass()
}
export function panel(page: Page, title: string) {
  return page.getByRole("heading", { name: title, exact: true }).locator("../..")
}
export async function closeDialog(page: Page) {
  await page.getByRole("dialog").last().getByRole("button", { name: "Fechar", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
}
export async function closeWindowWithKey(page: Page, key: "Enter" | "Escape") {
  await Promise.all([
    page.waitForEvent("close"),
    // Closing on keydown can destroy the target before dispatch is acknowledged.
    // The close event is still required, and every other input error must fail.
    page.keyboard.down(key).catch(error => {
      if (!(error instanceof Error) || !error.message.includes("Target page, context or browser has been closed")) throw error
    }),
  ])
}
export async function drag(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded()
  const from = await source.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error("Drag endpoints must be visible")
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 })
  await page.mouse.up()
}
