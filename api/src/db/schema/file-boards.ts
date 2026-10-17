import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { deletedAt, id, jsonArray, timestamp, timestamps } from "../columns"

export const BOARD_KINDS = ["receipts", "photos", "invoices", "notes", "other"] as const
export const FILE_KINDS = ["image", "receipt", "invoice", "note", "other"] as const

export const fileBoards = sqliteTable("file_boards", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  kind: text("kind", { enum: BOARD_KINDS }).notNull().default("other"),
  coverItemId: text("cover_item_id"),
  color: text("color").notNull().default("#06b6d4"),
  ...timestamps(),
  deletedAt: deletedAt(),
})

export const fileItems = sqliteTable(
  "file_items",
  {
    id: id(),
    boardId: text("board_id")
      .notNull()
      .references(() => fileBoards.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: FILE_KINDS }).notNull().default("image"),
    title: text("title"),
    notes: text("notes"),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // Relative to the uploads directory.
    storagePath: text("storage_path").notNull(),
    takenAt: timestamp("taken_at"),
    amountCents: integer("amount_cents"),
    currency: text("currency"),
    tags: jsonArray("tags"),
    linkedTaskIds: jsonArray("linked_task_ids"),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("file_items_board_idx").on(t.boardId)],
)

export type FileBoard = typeof fileBoards.$inferSelect
export type FileItem = typeof fileItems.$inferSelect
