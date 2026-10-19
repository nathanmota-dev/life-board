import { useTranslation } from "react-i18next"
import { useEffect } from "react"
import { AccentProvider } from "@/components/accent-provider"
import { QuickCapture } from "@/components/inbox/quick-capture"
import { ThemeProvider } from "@/components/theme-provider"
import { closeCaptureWindow, notifyCaptureSaved } from "@/lib/desktop-capture"

/** The small always-on-top window opened by the global capture shortcut. */
export function CapturePage() {
  const { t } = useTranslation()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCaptureWindow()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <ThemeProvider>
      <AccentProvider>
        <main className="flex h-svh flex-col gap-2 overflow-hidden bg-background p-3">
          <QuickCapture
            autoFocus
            onCaptured={() => {
              notifyCaptureSaved()
              closeCaptureWindow()
            }}
          />
          <p className="text-center text-xs text-muted-foreground">{t("inbox.captureWindowHint")}</p>
        </main>
      </AccentProvider>
    </ThemeProvider>
  )
}
