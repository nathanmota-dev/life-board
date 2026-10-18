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
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup()
})
