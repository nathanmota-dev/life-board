import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"
import { getCaptureShortcut } from "@/lib/desktop-capture"

export function CaptureShortcutHint() {
  const { t } = useTranslation()
  const [shortcut, setShortcut] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getCaptureShortcut().then((value) => active && setShortcut(value))
    return () => {
      active = false
    }
  }, [])

  return shortcut ? (
    <p className="mt-2 text-xs text-muted-foreground">
      {t("inbox.shortcutHint", { shortcut })}
    </p>
  ) : null
}
