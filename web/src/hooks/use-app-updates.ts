import { useSyncExternalStore } from "react"
import { getUpdateSnapshot, runUpdateAction, subscribeUpdates } from "@/lib/desktop-updates"

export function useAppUpdates() {
  const state = useSyncExternalStore(subscribeUpdates, getUpdateSnapshot)
  return { state, run: runUpdateAction }
}
