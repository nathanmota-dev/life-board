import { and, asc, eq, gte, isNull, lte, type SQL } from "drizzle-orm"
import { ulid } from "ulid"
import type { Db } from "../db/client"
import { calendarEvents, type CalendarEvent } from "../db/schema"
import type { CreateEventBody, ListEventsQuery, UpdateEventBody } from "../dto/calendar.dto"
import { BadRequestError, NotFoundError } from "./errors"

export class CalendarService {
  constructor(private readonly db: Db) {}

  list({ from, to, limit }: ListEventsQuery) {
    const conditions: SQL[] = [isNull(calendarEvents.deletedAt)]
    if (from) conditions.push(gte(calendarEvents.startAt, from))
    if (to) conditions.push(lte(calendarEvents.startAt, to))
    return this.db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(asc(calendarEvents.startAt))
      .limit(limit)
  }

  async create(input: CreateEventBody): Promise<CalendarEvent> {
    assertValidRange(input.startAt, input.endAt)
    const [row] = await this.db.insert(calendarEvents).values({ id: ulid(), ...input }).returning()
    return row
  }

  async update(id: string, input: UpdateEventBody): Promise<CalendarEvent> {
    const current = await this.find(id)
    assertValidRange(input.startAt ?? current.startAt, input.endAt ?? current.endAt)
    const [row] = await this.db
      .update(calendarEvents)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(calendarEvents.id, id))
      .returning()
    return row
  }

  async remove(id: string) {
    await this.find(id)
    await this.db.update(calendarEvents).set({ deletedAt: new Date() }).where(eq(calendarEvents.id, id))
  }

  private async find(id: string) {
    const [row] = await this.db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), isNull(calendarEvents.deletedAt)))
    if (!row) throw new NotFoundError("Event not found.")
    return row
  }
}

function assertValidRange(startAt: Date, endAt: Date) {
  if (endAt.getTime() < startAt.getTime()) {
    throw new BadRequestError("invalid_range", "endAt must be after startAt.")
  }
}
