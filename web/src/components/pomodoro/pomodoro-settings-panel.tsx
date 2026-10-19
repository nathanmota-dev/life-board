import { useTranslation } from "react-i18next"
import { BellRing } from "lucide-react"
import { DurationStepper } from "@/components/pomodoro/duration-stepper"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { notify } from "@/lib/notifications"
import { matchesPreset, POMODORO_PRESETS, SETTING_LIMITS } from "@/lib/pomodoro"
import { cn } from "@/lib/utils"
import type { DurationSetting, FlagSetting, PomodoroSettingsPanelProps, SettingSwitchProps } from "@/types/pomodoro"

const DURATIONS: DurationSetting[] = [
  { key: "focusMinutes", labelKey: "focusLength", step: 5, unit: "minutesUnit" },
  { key: "shortBreakMinutes", labelKey: "shortBreakLength", step: 1, unit: "minutesUnit" },
  { key: "longBreakMinutes", labelKey: "longBreakLength", step: 5, unit: "minutesUnit" },
  { key: "longBreakEvery", labelKey: "longBreakEvery", step: 1, unit: "sessionsUnit" },
  { key: "dailyGoal", labelKey: "dailyGoal", step: 1, unit: "sessionsUnit" },
]

const FLAGS: FlagSetting[] = [
  { key: "breaksEnabled", hintKey: "breaksHint" },
  { key: "autoStart", hintKey: "autoStartHint" },
  { key: "sound", hintKey: "soundHint" },
]

function SettingSwitch({ id, label, hint, checked, onChange }: SettingSwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function PomodoroSettingsPanel({ pomodoro }: PomodoroSettingsPanelProps) {
  const { t } = useTranslation()
  const { settings } = pomodoro.state
  // Break lengths only matter while breaks are on.
  const durations = settings.breaksEnabled ? DURATIONS : DURATIONS.filter(({ key }) => key === "focusMinutes" || key === "dailyGoal")

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t("pomodoro.presets")}</h3>
        <div className="grid grid-cols-3 gap-2">
          {POMODORO_PRESETS.map((preset) => {
            const active = matchesPreset(settings, preset)
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => pomodoro.updateSettings({ focusMinutes: preset.focusMinutes, shortBreakMinutes: preset.shortBreakMinutes, longBreakMinutes: preset.longBreakMinutes })}
                className={cn(
                  "flex cursor-pointer flex-col items-start rounded-xl border bg-background px-3 py-2 text-left shadow-xs transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                  active && "border-primary bg-primary/8 hover:bg-primary/12",
                )}
              >
                <span className="text-sm font-medium">{t(`pomodoro.preset.${preset.id}`)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{preset.focusMinutes}/{preset.shortBreakMinutes}</span>
              </button>
            )
          })}
        </div>
      </div>
      <Separator />
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">{t("pomodoro.durations")}</h3>
        {durations.map(({ key, labelKey, step, unit }) => (
          <DurationStepper
            key={key}
            id={`pomodoro-${key}`}
            label={t(`pomodoro.${labelKey}`)}
            unit={t(`pomodoro.${unit}`)}
            value={settings[key]}
            min={SETTING_LIMITS[key][0]}
            max={SETTING_LIMITS[key][1]}
            step={step}
            onChange={(value) => pomodoro.updateSettings({ [key]: value })}
          />
        ))}
      </div>
      <Separator />
      <div className="flex flex-col gap-4">
        {FLAGS.map(({ key, hintKey }) => (
          <SettingSwitch
            key={key}
            id={`pomodoro-${key}`}
            label={t(`pomodoro.${key}`)}
            hint={t(`pomodoro.${hintKey}`)}
            checked={settings[key]}
            onChange={(checked) => pomodoro.updateSettings({ [key]: checked })}
          />
        ))}
      </div>
      <Button
        variant="outline"
        className="cursor-pointer rounded-lg"
        onClick={() => void notify({ title: t("pomodoro.testTitle"), body: t("pomodoro.testBody"), route: "/pomodoro" })}
      >
        <BellRing />
        {t("pomodoro.testNotification")}
      </Button>
    </div>
  )
}
