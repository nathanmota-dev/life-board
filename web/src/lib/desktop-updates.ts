import type { UpdateState, UpdatesBridge } from "@/types/updates"

const unavailable: UpdateState = {
  status: "unavailable", installedVersion: "—", format: null, lastAttempt: null, lastSuccess: null,
  release: null, progress: null, error: null, retryAction: "check",
}
let state = unavailable
let bridge: UpdatesBridge | undefined
let cleanup: (() => void) | undefined
let generation = 0
const listeners = new Set<() => void>()
function publish(next: UpdateState) { state = next; for (const listener of listeners) listener() }
export const getUpdateSnapshot = () => state

/** One shared renderer subscription. Main owns the updater, schedule and durable snapshot. */
export function subscribeUpdates(listener: () => void) {
  listeners.add(listener)
  if (!cleanup) {
    if (bridge !== window.desktop?.updates) { bridge = window.desktop?.updates; state = unavailable }
    const current = ++generation
    let revision = 0
    const unsubscribe = bridge?.onState((next) => { revision++; publish(next) }) ?? (() => {})
    const initialRevision = revision
    void Promise.all([bridge?.getState() ?? Promise.resolve(unavailable), window.desktop?.getVersion() ?? Promise.resolve("—")])
      .then(([next, version]) => { if (generation === current && revision === initialRevision) publish({ ...next, installedVersion: version }) })
      .catch(() => { if (generation === current) publish({ ...state, status: "error", error: "network" }) })
    cleanup = () => { generation++; unsubscribe(); cleanup = undefined }
  }
  return () => { listeners.delete(listener); if (!listeners.size) cleanup?.() }
}

export async function runUpdateAction(action: "check" | "download" | "install") {
  try {
    const next = await window.desktop?.updates?.[action]()
    if (next) publish(next)
  } catch { publish({ ...state, status: "error", error: "network", retryAction: action }) }
}
