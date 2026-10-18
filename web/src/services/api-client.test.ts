import { afterEach, describe, expect, it } from "vitest"
import { ApiError, api, buildApiUrl, getApiBaseUrl, setApiBaseUrl } from "@/services/api-client"
import { mockApi, resetApiMock } from "@/test/mock-api"

afterEach(() => {
  resetApiMock()
  delete window.desktop
})

describe("api client", () => {
  it("asks Electron for the base URL and falls back outside it", async () => {
    window.desktop = { getVersion: async () => "1", getApiBaseUrl: async () => "http://127.0.0.1:4321", openExternal: async () => {} }
    setApiBaseUrl(null)
    expect(await getApiBaseUrl()).toBe("http://127.0.0.1:4321")

    delete window.desktop
    setApiBaseUrl(null)
    expect(await getApiBaseUrl()).toBe("http://127.0.0.1:3000")
  })

  it("builds URLs under /api and skips empty query values", async () => {
    setApiBaseUrl("http://api.test")
    expect(await buildApiUrl("/tasks", { status: "today", search: "", tag: undefined, limit: 10, pinned: false })).toBe(
      "http://api.test/api/tasks?status=today&limit=10&pinned=false",
    )
  })

  it("sends JSON bodies and parses JSON responses", async () => {
    const { calls, fetchMock } = mockApi({ "POST /tasks": ({ body }) => ({ id: "t1", ...(body as object) }) })

    expect(await api.post("/tasks", { title: "Write tests" })).toEqual({ id: "t1", title: "Write tests" })
    expect(calls[0].body).toEqual({ title: "Write tests" })
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ "Content-Type": "application/json" })
  })

  it("sends FormData untouched and no JSON header for bodiless requests", async () => {
    const { fetchMock } = mockApi({ "POST /file-boards/b1/items": () => ({ id: "f1" }), "DELETE /tasks/t1": () => ({ ok: true }) })
    const form = new FormData()
    form.append("file", new Blob(["x"]), "a.txt")

    await api.post("/file-boards/b1/items", form)
    await api.delete("/tasks/t1")

    expect(fetchMock.mock.calls[0][1]?.body).toBe(form)
    expect(fetchMock.mock.calls[0][1]?.headers).toBeUndefined()
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE", body: undefined, headers: undefined })
  })

  it("turns error responses into ApiError with the API's code and message", async () => {
    mockApi({ "GET /goals/x": () => [404, { error: "not_found", message: "Goal not found." }] })

    const error = await api.get("/goals/x").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, code: "not_found", message: "Goal not found." })
  })
})
