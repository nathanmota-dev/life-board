import { Globe } from "lucide-react"
import { useTranslation } from "react-i18next"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/workspace-ui"
import { LANGUAGE_OPTIONS } from "@/lib/i18n"

export function LanguagePanel() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage === "pt" ? "pt" : "en"

  return (
    <Panel title={t("settings.language.title")}>
      <p className="mb-4 text-sm text-muted-foreground">{t("settings.language.description")}</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="cursor-pointer rounded-full"
          aria-label={t("settings.language.switch")}
          title={t("settings.language.switch")}
          onClick={() => {
            void i18n.changeLanguage(language === "pt" ? "en" : "pt")
          }}
        >
          <Globe aria-hidden="true" strokeWidth={1.7} />
        </Button>
        <SegmentedControl
          label={t("settings.language.label")}
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={(language) => {
            void i18n.changeLanguage(language)
          }}
        />
      </div>
    </Panel>
  )
}
