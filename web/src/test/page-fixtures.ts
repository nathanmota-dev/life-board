import type { Page } from "@/types/page"

export function pageFixture(overrides: Partial<Page> = {}): Page {
  return {
    id: "p1",
    parentId: null,
    kind: "page",
    title: "Groceries",
    sizeBytes: 20,
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-01T12:00:00.000Z",
    ...overrides,
  }
}

export function folderFixture(overrides: Partial<Page> = {}): Page {
  return pageFixture({ id: "d1", kind: "folder", title: "Home", sizeBytes: 0, ...overrides })
}
