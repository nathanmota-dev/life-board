import { vi } from "vitest"
import { setApiBaseUrl } from "@/services/api-client"

export type MockRequest = { method: string; path: string; query: URLSearchParams; body: unknown }

type Handler = (request: MockRequest) => unknown

/**
 * Stubs `fetch` for the API. Keys are "METHOD /path" (without the /api prefix);
 * a handler returns the JSON body, or `[status, body]` for errors.
 */
export function mockApi(handlers: Record<string, Handler>) {
  setApiBaseUrl("http://api.test")
  const calls: MockRequest[] = []

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? "GET"
    const path = url.pathname.replace(/^\/api/, "")
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body
    const request = { method, path, query: url.searchParams, body }
    calls.push(request)

    const handler = handlers[`${method} ${path}`]
    const result = handler ? handler(request) : [404, { error: "not_found", message: `No mock for ${method} ${path}` }]
    const [status, payload] = Array.isArray(result) && typeof result[0] === "number" ? result : [200, result]
    return new Response(JSON.stringify(payload), { status: status as number, headers: { "Content-Type": "application/json" } })
  })

  vi.stubGlobal("fetch", fetchMock)
  return { calls, fetchMock }
}

export function resetApiMock() {
  vi.unstubAllGlobals()
  setApiBaseUrl(null)
}
