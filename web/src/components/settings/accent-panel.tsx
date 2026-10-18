import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, RotateCcw } from "lucide-react"
import { useAccent } from "@/components/accent-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Panel } from "@/components/workspace-ui"
import { ACCENT_PRESETS, DEFAULT_ACCENT, isHexColor } from "@/lib/accent"
import { cn } from "@/lib/utils"

export function AccentPanel() {
  const { t } = useTranslation()
  const { accent, setAccent, resetAccent } = useAccent()
  const [draft, setDraft] = useState(accent)

  useEffect(() => setDraft(accent), [accent])

  return (
    <Panel
      title={t("settings.accent.title")}
      action={
        <Button variant="ghost" size="sm" disabled={accent === DEFAULT_ACCENT} onClick={resetAccent}>
          <RotateCcw />
          {t("settings.accent.reset")}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">{t("settings.accent.description")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {ACCENT_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={t("settings.accent.useColor", { color })}
            aria-pressed={accent.toLowerCase() === color.toLowerCase()}
            onClick={() => setAccent(color)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            style={{ backgroundColor: color }}
          >
            {accent.toLowerCase() === color.toLowerCase() ? <Check className="size-4 text-white mix-blend-difference" /> : null}
          </button>
        ))}
        <label className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]">
          <span className="sr-only">{t("settings.accent.customColor")}</span>
          <input
            type="color"
            value={accent}
            onChange={(event) => setAccent(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <Input
          aria-label={t("settings.accent.hexCode")}
          value={draft}
          maxLength={7}
          onChange={(event) => {
            setDraft(event.target.value)
            if (isHexColor(event.target.value)) setAccent(event.target.value)
          }}
          className={cn("h-8 w-28 font-mono text-sm uppercase", !isHexColor(draft) && "border-destructive")}
        />
      </div>
      <div className="mt-5 flex items-end gap-3 rounded-xl border bg-muted/30 p-4" aria-hidden="true">
        <Button size="sm" tabIndex={-1}>
          {t("settings.accent.preview")}
        </Button>
        <div className="flex h-10 flex-1 items-end gap-1">
          {[40, 70, 55, 90, 65, 80, 50].map((height, index) => (
            <span key={index} className={cn("flex-1 rounded-sm", index % 2 ? "bg-chart-3" : "bg-chart-1")} style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </Panel>
  )
}
