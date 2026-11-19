import { useTranslation } from "react-i18next"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { MarkdownMode, MarkdownModeToggleProps } from "@/types/page"

/** Switches a `.md` file between the formatted editor and its markdown source. */
export function MarkdownModeToggle({ mode, onChange }: MarkdownModeToggleProps) {
  const { t } = useTranslation()
  return (
    <Tabs value={mode} onValueChange={(value) => onChange(value as MarkdownMode)}>
      <TabsList aria-label={t("pages.markdownMode")}>
        <TabsTrigger value="rich">{t("pages.markdownRich")}</TabsTrigger>
        <TabsTrigger value="source">{t("pages.markdownSource")}</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
