export type QueryValue = string | number | boolean | null | undefined

export type QueryParams = Record<string, QueryValue>

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  query?: QueryParams
  body?: unknown
}

export type ListResponse<T> = { items: T[] }

export type OkResponse = { ok: true }

export type ApiErrorBody = { error?: string; message?: string }
