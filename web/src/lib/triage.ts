import type { TriageAction } from "@/types/inbox"
import type { Task, TaskInput } from "@/types/task"
import type { ThoughtInput } from "@/types/thought"

// Digits and letters, so the shortcuts are the same in every language.
const KEY_ACTIONS: Record<string, TriageAction> = {
  "1": "today",
  "2": "upcoming",
  "3": "someday",
  "4": "thought",
  e: "edit",
  delete: "delete",
  backspace: "delete",
  arrowright: "skip",
  s: "skip",
  z: "undo",
  escape: "exit",
}

export const TRIAGE_KEY_HINTS: Record<TriageAction, string> = {
  today: "1",
  upcoming: "2",
  someday: "3",
  thought: "4",
  edit: "E",
  delete: "Del",
  skip: "→",
  undo: "Z",
  exit: "Esc",
}

/** Inputs, text areas, selects and rich-text editors keep their own keys. */
export function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

export function triageKeyAction(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat" | "target">) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || isTypingTarget(event.target)) return null
  return KEY_ACTIONS[event.key.toLowerCase()] ?? null
}

/** The fields needed to bring a deleted task back into the inbox. */
export function taskToInboxInput(task: Task): TaskInput {
  return {
    title: task.title,
    description: task.description,
    status: "inbox",
    priority: task.priority,
    dueAt: task.dueAt,
    tags: task.tags,
    linkedThoughtIds: task.linkedThoughtIds,
  }
}

export function taskToThoughtInput(task: Task): ThoughtInput {
  return {
    body: [task.title, task.description].filter(Boolean).join("\n\n"),
    tags: task.tags,
  }
}
