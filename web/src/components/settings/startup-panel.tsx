import { useTranslation } from "react-i18next"
import { Switch } from "@/components/ui/switch"
import { Panel } from "@/components/workspace-ui"
import { useStartupSettings } from "@/hooks/use-startup-settings"

export function StartupPanel() {
  const { t } = useTranslation()
  const { settings, saving, error, available, update } = useStartupSettings()

  return (
    <Panel title={t("settings.startup.title")}>
      <p className="mb-4 text-sm text-muted-foreground">{t("settings.startup.description")}</p>
      <div className="flex flex-col gap-5" aria-busy={saving}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <label htmlFor="startup-login" className="cursor-pointer text-sm">{t("settings.startup.startOnLogin")}</label>
            <p id="startup-login-hint" className="mt-1 text-xs text-muted-foreground">{t("settings.startup.loginHint")}</p>
          </div>
          <Switch id="startup-login" aria-describedby="startup-login-hint" checked={settings?.startOnLogin ?? false}
            disabled={!settings || saving} onCheckedChange={(checked) => void update({ startOnLogin: checked })} />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <label htmlFor="startup-background" className="cursor-pointer text-sm">{t("settings.startup.keepInBackground")}</label>
            <p id="startup-background-hint" className="mt-1 text-xs text-muted-foreground">{t("settings.startup.backgroundHint")}</p>
            <p id="startup-pomodoro-hint" className="mt-1 text-xs text-muted-foreground">{t("settings.startup.pomodoroHint")}</p>
          </div>
          <Switch id="startup-background" aria-describedby="startup-background-hint startup-pomodoro-hint"
            checked={settings?.keepInBackground ?? false} disabled={!settings || saving}
            onCheckedChange={(checked) => void update({ keepInBackground: checked })} />
        </div>
        {!available && <p className="text-sm text-muted-foreground">{t("settings.startup.desktopOnly")}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{t(`settings.startup.${error}`)}</p>}
      </div>
    </Panel>
  )
}
