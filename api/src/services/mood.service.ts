import { desc, eq } from "drizzle-orm"
import { ulid } from "ulid"
import type { Db } from "../db/client"
import { moodEntries, type MoodEntry } from "../db/schema"
import type { UpsertMoodBody } from "../dto/mood.dto"
import { addDays, fromDayKey, toDayKey } from "./date.service"
import { NotFoundError } from "./errors"

export class MoodService {
  constructor(private readonly db: Db) {}

  async today(now = new Date()) {
    const day = toDayKey(now)
    const [entry] = await this.db.select().from(moodEntries).where(eq(moodEntries.day, day))
    return {
      day,
      entry: entry ?? null,
      nextAvailableAt: addDays(fromDayKey(day), 1).toISOString(),
    }
  }

  list(limit: number) {
    return this.db.select().from(moodEntries).orderBy(desc(moodEntries.day)).limit(limit)
  }

  /** One entry per day: re-submitting the same day refines the existing entry. */
  async upsert({ day = toDayKey(), score, note = null, linkedTaskIds }: UpsertMoodBody) {
    const [existing] = await this.db.select().from(moodEntries).where(eq(moodEntries.day, day))
    if (existing) {
      const [entry] = await this.db
        .update(moodEntries)
        .set({ score, note, ...(linkedTaskIds && { linkedTaskIds }), updatedAt: new Date() })
        .where(eq(moodEntries.id, existing.id))
        .returning()
      return { entry, created: false }
    }
    const [entry]: MoodEntry[] = await this.db
      .insert(moodEntries)
      .values({ id: ulid(), day, score, note, linkedTaskIds })
      .returning()
    return { entry, created: true }
  }

  async remove(id: string) {
    const [row] = await this.db.delete(moodEntries).where(eq(moodEntries.id, id)).returning({ id: moodEntries.id })
    if (!row) throw new NotFoundError("Mood entry not found.")
  }
}
