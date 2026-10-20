import { useEffect, useState } from "react"
import type { StartupSettings } from "@/types/settings"

export function useStartupSettings() {
  const bridge = window.desktop?.app
  const [settings, setSettings] = useState<StartupSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<"loadError" | "saveError" | null>(null)

  useEffect(() => {
    if (!bridge) return
    let active = true
    const load = () => {
      void bridge.getStartupSettings().then((value) => {
        if (active) { setSettings(value); setError(null) }
      }).catch(() => {
        if (active) setError("loadError")
      })
    }
    load()
    window.addEventListener("focus", load)
    return () => { active = false; window.removeEventListener("focus", load) }
  }, [bridge])

  async function update(patch: Partial<StartupSettings>) {
    if (!bridge) return
    setSaving(true)
    setError(null)
    try {
      setSettings(await bridge.updateStartupSettings(patch))
    } catch {
      setError("saveError")
    } finally {
      setSaving(false)
    }
  }

  return { settings, saving, error, available: Boolean(bridge), update }
}
