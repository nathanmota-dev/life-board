import { useEffect, useState } from "react"
import { useCreateTask, useRemoveTask, useUpdateTask } from "@/hooks/queries/use-tasks"
import { useCreateThought, useRemoveThought } from "@/hooks/queries/use-thoughts"
import { fromDateInput } from "@/lib/dates"
import { taskToInboxInput, taskToThoughtInput, triageKeyAction } from "@/lib/triage"
import type { TriageAction, TriageDecision } from "@/types/inbox"
import type { Task, TaskStatus } from "@/types/task"

type TriageMode = "idle" | "date" | "edit"

/**
 * Walks the inbox one task at a time. `tasks` is the live inbox list: once a decision is
 * saved the task leaves it, so the session only keeps the order and the undo history.
 */
export function useTriage(tasks: Task[], onExit: () => void) {
  const [queue, setQueue] = useState(() => tasks.map((task) => task.id))
  const [history, setHistory] = useState<TriageDecision[]>([])
  const [mode, setMode] = useState<TriageMode>("idle")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const removeTask = useRemoveTask()
  const createThought = useCreateThought()
  const removeThought = useRemoveThought()

  const byId = new Map(tasks.map((task) => [task.id, task]))
  const remaining = queue.filter((id) => byId.has(id))
  const current = remaining.length > 0 ? byId.get(remaining[0]) : undefined

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  const decide = (decision: () => Promise<TriageDecision>) =>
    run(async () => {
      const saved = await decision()
      setHistory((entries) => [...entries, saved])
      setQueue((ids) => ids.filter((id) => id !== saved.task.id))
    })

  const setStatus = (task: Task, status: TaskStatus, dueAt?: string | null) =>
    decide(async () => {
      await updateTask.mutateAsync({ id: task.id, input: dueAt === undefined ? { status } : { status, dueAt } })
      return { kind: "status", task }
    })

  // The thought is created before the task is deleted, so a failed delete never loses the text.
  const toThought = (task: Task) =>
    decide(async () => {
      const thought = await createThought.mutateAsync(taskToThoughtInput(task))
      await removeTask.mutateAsync(task.id)
      return { kind: "thought", task, thoughtId: thought.id }
    })

  const restore = (id: string) => {
    setHistory((entries) => entries.slice(0, -1))
    setQueue((ids) => [id, ...ids.filter((queued) => queued !== id)])
  }

  const undo = (decision: TriageDecision) =>
    run(async () => {
      if (decision.kind === "status") {
        const { id, status, dueAt } = decision.task
        await updateTask.mutateAsync({ id, input: { status, dueAt } })
        restore(id)
        return
      }
      const task = await createTask.mutateAsync(taskToInboxInput(decision.task))
      restore(task.id)
      if (decision.kind === "thought") await removeThought.mutateAsync(decision.thoughtId)
    })

  const remove = (task: Task) =>
    decide(async () => {
      await removeTask.mutateAsync(task.id)
      return { kind: "delete", task }
    })

  // Skipped tasks go to the back of the queue and come around again.
  const skip = (task: Task) => setQueue((ids) => [...ids.filter((id) => id !== task.id), task.id])

  const perform = (action: TriageAction) => {
    const last = history.at(-1)
    if (action === "exit") onExit()
    else if (action === "undo" && last) void undo(last)
    else if (!current) return
    else if (action === "today" || action === "someday") void setStatus(current, action)
    else if (action === "upcoming") setMode("date")
    else if (action === "edit") setMode("edit")
    else if (action === "thought") void toThought(current)
    else if (action === "delete") void remove(current)
    else if (action === "skip") skip(current)
  }

  const confirmDate = (day: string) => {
    setMode("idle")
    if (current) void setStatus(current, "upcoming", fromDateInput(day))
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = mode === "idle" && !busy && !event.defaultPrevented ? triageKeyAction(event) : null
      if (!action) return
      event.preventDefault()
      perform(action)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  })

  return {
    current,
    position: history.length + 1,
    total: history.length + remaining.length,
    triaged: history.length,
    canUndo: history.length > 0,
    mode,
    busy,
    error,
    perform,
    confirmDate,
    closeOverlay: () => setMode("idle"),
  }
}
