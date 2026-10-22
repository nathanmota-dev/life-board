import type { Locator, Page } from "@playwright/test"
import type { Workspace } from "../fixtures"

// Playwright videos have no pointer, so the page draws one that follows mouse
// events, plus a caption that names each screen.
function installOverlay() {
  const install = () => {
    if (document.getElementById("demo-cursor")) return
    const cursor = document.createElement("div")
    cursor.id = "demo-cursor"
    cursor.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)"
    cursor.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" style="transition:transform .12s;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))"><path d="M4 2l15 11.5-6.6.9 3.9 7.4-3 1.5-3.8-7.5L4 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    const caption = document.createElement("div")
    caption.id = "demo-caption"
    caption.style.cssText = "position:fixed;left:50%;bottom:28px;z-index:2147483646;pointer-events:none;transform:translate(-50%,12px);opacity:0;transition:opacity .35s,transform .35s;padding:10px 20px;border-radius:999px;background:rgba(17,17,17,.88);color:#fff;font:500 17px/1.3 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);white-space:nowrap"
    document.documentElement.append(caption, cursor)
    const icon = cursor.firstElementChild as SVGElement
    addEventListener("mousemove", event => { cursor.style.transform = `translate(${event.clientX - 4}px,${event.clientY - 2}px)` }, true)
    addEventListener("mousedown", () => { icon.style.transform = "scale(.82)" }, true)
    addEventListener("mouseup", () => { icon.style.transform = "" }, true)
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install)
  else install()
}

export class Director {
  private x = 800
  private y = 450
  constructor(readonly page: Page) {}

  async install() {
    await this.page.context().addInitScript(installOverlay)
    await this.page.evaluate(installOverlay)
    await this.page.mouse.move(this.x, this.y)
  }

  wait(ms: number) {
    return this.page.waitForTimeout(ms)
  }

  async caption(text: string) {
    await this.page.evaluate(value => {
      const caption = document.getElementById("demo-caption")!
      caption.textContent = value
      caption.style.opacity = "1"
      caption.style.transform = "translate(-50%,0)"
      clearTimeout(Number(caption.dataset.timer))
      caption.dataset.timer = String(setTimeout(() => {
        caption.style.opacity = "0"
        caption.style.transform = "translate(-50%,12px)"
      }, 2600))
    }, text)
  }

  /** Glides the pointer to the target before acting, like a person would. */
  async moveTo(locator: Locator) {
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    if (!box) throw new Error("Demo target must be visible")
    const x = box.x + Math.min(box.width / 2, 40)
    const y = box.y + box.height / 2
    const steps = Math.max(8, Math.round(Math.hypot(x - this.x, y - this.y) / 45))
    await this.page.mouse.move(x, y, { steps })
    this.x = x
    this.y = y
    await this.wait(80)
  }

  async click(locator: Locator) {
    await locator.waitFor()
    await this.moveTo(locator)
    await locator.click({ position: await this.offset(locator) })
    await this.wait(250)
  }

  async type(locator: Locator, text: string) {
    await this.click(locator)
    await locator.pressSequentially(text, { delay: 22 })
    await this.wait(150)
  }

  async drag(source: Locator, target: Locator) {
    await this.moveTo(source)
    await this.page.mouse.down()
    await this.page.mouse.move(this.x + 14, this.y, { steps: 5 })
    const box = await target.boundingBox()
    if (!box) throw new Error("Drop target must be visible")
    const x = box.x + box.width / 2
    const y = box.y + Math.min(box.height / 2, 160)
    await this.page.mouse.move(x, y, { steps: 25 })
    await this.wait(150)
    await this.page.mouse.up()
    this.x = x
    this.y = y
    await this.wait(350)
  }

  async scroll(delta: number) {
    const step = Math.sign(delta) * 80
    for (let moved = 0; Math.abs(moved) < Math.abs(delta); moved += step) {
      await this.page.mouse.wheel(0, step)
      await this.wait(16)
    }
    await this.wait(300)
  }

  /** Opens a screen from the sidebar and names it in the caption. */
  async go(workspace: Workspace, title: string, caption: string) {
    await this.click(this.page.locator('[data-sidebar="sidebar"]').getByRole("link", { name: title, exact: true }))
    await workspace.ready(title)
    await this.caption(caption)
    await this.wait(600)
  }

  private async offset(locator: Locator) {
    const box = (await locator.boundingBox())!
    return { x: this.x - box.x, y: this.y - box.y }
  }
}
