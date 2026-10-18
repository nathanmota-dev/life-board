import { createContext, useContext, useEffect, useState } from "react"
import { ACCENT_STORAGE_KEY, applyAccent, DEFAULT_ACCENT, isHexColor, readStoredAccent } from "@/lib/accent"
import type { AccentProviderProps } from "@/types/ui"
import type { AccentState } from "@/types/settings"

const AccentContext = createContext<AccentState | undefined>(undefined)

export function AccentProvider({ children }: AccentProviderProps) {
  const [accent, setAccentState] = useState(readStoredAccent)

  useEffect(() => applyAccent(accent), [accent])

  const setAccent = (next: string) => {
    if (!isHexColor(next)) return
    window.localStorage.setItem(ACCENT_STORAGE_KEY, next)
    setAccentState(next)
  }

  const resetAccent = () => {
    window.localStorage.removeItem(ACCENT_STORAGE_KEY)
    setAccentState(DEFAULT_ACCENT)
  }

  return <AccentContext.Provider value={{ accent, setAccent, resetAccent }}>{children}</AccentContext.Provider>
}

export function useAccent() {
  const context = useContext(AccentContext)
  if (context === undefined) throw new Error("useAccent must be used within an AccentProvider")
  return context
}
