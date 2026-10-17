import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm"
import { ulid } from "ulid"
import type { Db } from "../db/client"
import { thoughts, type Thought } from "../db/schema"
import type { CreateThoughtBody, ListThoughtsQuery, UpdateThoughtBody } from "../dto/thoughts.dto"
import { NotFoundError } from "./errors"
import { jsonArrayContains, searchColumns } from "./query.service"

export class ThoughtsService {
  constructor(private readonly db: Db) {}

  async list({ limit, cursor, pinned, tag, search }: ListThoughtsQuery) {
    const conditions: SQL[] = [isNull(thoughts.deletedAt)]
    if (pinned !== undefined) conditions.push(eq(thoughts.pinned, pinned))
    if (tag) conditions.push(jsonArrayContains(thoughts.tags, tag))
    if (search) conditions.push(searchColumns([thoughts.title, thoughts.body], search))
    if (cursor) conditions.push(afterCursor(cursor))

    const rows = await this.db
      .select()
      .from(thoughts)
      .where(and(...conditions))
      .orderBy(desc(thoughts.pinned), desc(thoughts.createdAt), desc(thoughts.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const last = items[items.length - 1]
    const nextCursor = hasMore ? `${last.pinned ? 1 : 0}:${last.createdAt.getTime()}:${last.id}` : null
    return { items, nextCursor }
  }

  async create(input: CreateThoughtBody): Promise<Thought> {
    const [row] = await this.db.insert(thoughts).values({ id: ulid(), ...input }).returning()
    return row
  }

  async get(id: string): Promise<Thought> {
    const [row] = await this.db
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.id, id), isNull(thoughts.deletedAt)))
    if (!row) throw new NotFoundError("Thought not found.")
    return row
  }

  async update(id: string, input: UpdateThoughtBody): Promise<Thought> {
    const [row] = await this.db
      .update(thoughts)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(thoughts.id, id), isNull(thoughts.deletedAt)))
      .returning()
    if (!row) throw new NotFoundError("Thought not found.")
    return row
  }

  async remove(id: string) {
    const [row] = await this.db
      .update(thoughts)
      .set({ deletedAt: new Date() })
      .where(and(eq(thoughts.id, id), isNull(thoughts.deletedAt)))
      .returning({ id: thoughts.id })
    if (!row) throw new NotFoundError("Thought not found.")
  }
}

/** Rows that sort after the cursor's row in (pinned, createdAt, id) descending order. */
function afterCursor(cursor: string): SQL {
  const [pinned, createdAt, id] = cursor.split(":")
  return sql`(${thoughts.pinned}, ${thoughts.createdAt}, ${thoughts.id}) < (${Number(pinned)}, ${Number(createdAt)}, ${id})`
}
