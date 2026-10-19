import type { Toast } from "@/types/ui"

const TOAST_DURATION_MS = 5_000

let toasts: Toast[] = []
let nextId = 0
const listeners = new Set<() => void>()

function emit(next: Toast[]) {
  toasts = next
  for (const listener of listeners) listener()
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getToasts() {
  return toasts
}

export function dismissToast(id: number) {
  emit(toasts.filter((toast) => toast.id !== id))
}

/** Shows a short message at the bottom of the window, with an optional action such as Undo. */
export function showToast(toast: Omit<Toast, "id">, duration = TOAST_DURATION_MS) {
  nextId += 1
  const id = nextId
  emit([...toasts.slice(-2), { ...toast, id }])
  setTimeout(() => dismissToast(id), duration)
  return id
}
