import type { TagSummary } from "@/types/tag"
import type { Task } from "@/types/task"
import type { Thought } from "@/types/thought"

/** Every tag used by tasks or thoughts, most used first. */
export function summarizeTags(tasks: Task[], thoughts: Thought[]): TagSummary[] {
  const summary = new Map<string, TagSummary>()
  const bump = (name: string, field: "tasks" | "thoughts") => {
    const entry = summary.get(name) ?? { name, tasks: 0, thoughts: 0, total: 0 }
    entry[field] += 1
    entry.total += 1
    summary.set(name, entry)
  }
  for (const task of tasks) task.tags.forEach((tag) => bump(tag, "tasks"))
  for (const thought of thoughts) thought.tags.forEach((tag) => bump(tag, "thoughts"))
  return [...summary.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}
