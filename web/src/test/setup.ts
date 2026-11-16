import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach } from "vitest"
import { i18n } from "@/lib/i18n"

beforeEach(async () => {
  await i18n.changeLanguage("en")
})

// jsdom doesn't implement these; the router and some Radix/Recharts parts call them.
window.scrollTo = () => {}
HTMLElement.prototype.scrollIntoView ??= () => {}
window.matchMedia ??= (query: string) =>
  ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
globalThis.CSS ??= {} as typeof CSS
CSS.supports ??= () => true
// jsdom has no layout; the markdown editor (ProseMirror) measures text to place the cursor and scroll to it.
const noRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect
Range.prototype.getBoundingClientRect ??= noRect
Range.prototype.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
document.elementFromPoint ??= () => null
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup()
})
