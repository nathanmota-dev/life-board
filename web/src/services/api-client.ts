import type { ApiErrorBody, QueryParams, RequestOptions } from "@/types/api"

const FALLBACK_BASE_URL = "http://127.0.0.1:3000"

let baseUrl: Promise<string> | null = null

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Electron hands out the API port at runtime; outside it (tests, plain browser) a fallback is used. */
export function getApiBaseUrl() {
  baseUrl ??= window.desktop?.getApiBaseUrl
    ? window.desktop.getApiBaseUrl()
    : Promise.resolve(import.meta.env.VITE_API_URL ?? FALLBACK_BASE_URL)
  return baseUrl
}

export function setApiBaseUrl(url: string | null) {
  baseUrl = url === null ? null : Promise.resolve(url)
}

export async function buildApiUrl(path: string, query?: QueryParams) {
  const url = new URL(`/api${path}`, await getApiBaseUrl())
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value))
  }
  return url.toString()
}

export async function apiRequest<T>(path: string, { method = "GET", query, body }: RequestOptions = {}): Promise<T> {
  const isForm = body instanceof FormData
  const hasJsonBody = body !== undefined && !isForm
  const response = await fetch(await buildApiUrl(path, query), {
    method,
    credentials: "include",
    headers: hasJsonBody ? { "Content-Type": "application/json" } : undefined,
    body: isForm ? body : hasJsonBody ? JSON.stringify(body) : undefined,
  })
  const data = (await response.json().catch(() => undefined)) as (T & ApiErrorBody) | undefined
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? "request_failed", data?.message ?? response.statusText)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, query?: QueryParams) => apiRequest<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  put: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
}
