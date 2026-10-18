import { CircleCheck, Flag, Lightbulb, ListPlus, Smile, Target } from "lucide-react"
import { formatTime, fromDayKey, toDayKey } from "@/lib/dates"
import { moodOption } from "@/lib/mood"
import { thoughtTitle } from "@/lib/thoughts"
import type { ActivityDay, ActivityItem, ActivitySources } from "@/types/activity"
import type { MoodEntry } from "@/types/mood"

/** A single feed of what happened recently, newest first, grouped by local day. */
export function buildActivity({ tasks, thoughts, mood, goals }: ActivitySources, limit = 60): ActivityDay[] {
  const items: ActivityItem[] = [
    ...tasks.map((task) => ({ id: `task-new-${task.id}`, kind: "task" as const, title: task.title, detail: "Task created", at: task.createdAt, icon: ListPlus })),
    ...tasks.flatMap((task) =>
      task.completedAt
        ? [{ id: `task-done-${task.id}`, kind: "task" as const, title: task.title, detail: "Task completed", at: task.completedAt, icon: CircleCheck }]
        : [],
    ),
    ...thoughts.map((thought) => ({ id: `thought-${thought.id}`, kind: "thought" as const, title: thoughtTitle(thought), detail: "Thought captured", at: thought.createdAt, icon: Lightbulb })),
    ...mood.map((entry) => ({
      id: `mood-${entry.id}`,
      kind: "mood" as const,
      title: `${moodOption(entry.score).emoji} Feeling ${moodOption(entry.score).label.toLowerCase()}`,
      detail: entry.note || "Mood check-in",
      at: moodTimestamp(entry),
      icon: Smile,
    })),
    ...goals.map((goal) => ({ id: `goal-${goal.id}`, kind: "goal" as const, title: goal.title, detail: "Goal set", at: goal.createdAt, icon: Target })),
    ...goals.flatMap((goal) =>
      goal.completedAt
        ? [{ id: `goal-done-${goal.id}`, kind: "goal" as const, title: goal.title, detail: "Goal completed", at: goal.completedAt, icon: Flag }]
        : [],
    ),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)

  const days = new Map<string, ActivityItem[]>()
  for (const item of items) {
    const day = toDayKey(new Date(item.at))
    days.set(day, [...(days.get(day) ?? []), item])
  }
  return [...days.entries()].map(([day, dayItems]) => ({ day, items: dayItems }))
}

/** Back-filled entries keep their own day; same-day check-ins keep their real time. */
function moodTimestamp(entry: MoodEntry) {
  if (toDayKey(new Date(entry.createdAt)) === entry.day) return entry.createdAt
  const noon = fromDayKey(entry.day)
  noon.setHours(12)
  return noon.toISOString()
}

export function activityTime(item: ActivityItem) {
  return formatTime(item.at)
}

