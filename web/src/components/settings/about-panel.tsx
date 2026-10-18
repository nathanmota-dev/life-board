import { useTranslation } from "react-i18next"
import { Panel, Status } from "@/components/workspace-ui"

export function AboutPanel() {
  const { t } = useTranslation()

  return (
    <Panel title={t("settings.about.title")}>
      <div className="mb-3">
        <Status value={t("settings.about.local")} />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("settings.about.description")}
      </p>
    </Panel>
  )
}
