import { useTranslation } from "react-i18next"
import { ArrowLeft } from "lucide-react"
import type { BackButtonProps } from "@/types/ui"

/** Icon-only button that returns to the previous screen. */
export function BackButton({ onClick }: BackButtonProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("common.back")}
      title={t("common.back")}
      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ArrowLeft className="size-4" />
    </button>
  )
}
