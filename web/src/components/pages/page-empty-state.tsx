import { useTranslation } from "react-i18next"
import { NotebookText } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"

/** The right pane of `/pages`, before a page is chosen. */
export function PageEmptyState() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState icon={NotebookText} title={t("pages.selectPage")} description={t("pages.selectPageDescription")} />
    </div>
  )
}
