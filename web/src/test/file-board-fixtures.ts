import type { FileBoard, FileItem } from "@/types/file-board"

export function fileItemFixture(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "f1",
    boardId: "b1",
    kind: "other",
    title: "notes.txt",
    notes: null,
    mime: "text/plain",
    sizeBytes: 175,
    amountCents: null,
    currency: null,
    tags: [],
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-01T12:00:00.000Z",
    ...overrides,
  }
}

export function fileBoardFixture(overrides: Partial<FileBoard> = {}): FileBoard {
  return {
    id: "b1",
    name: "Bills",
    description: null,
    kind: "notes",
    color: "#888888",
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-01T12:00:00.000Z",
    ...overrides,
  }
}
