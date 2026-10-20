import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { useAppUpdates } from "@/hooks/use-app-updates"

export function UpdateIndicator() {
  const { t } = useTranslation()
  const { state } = useAppUpdates()

  return state.release ? (
    <Link to="/settings" search={{ tab: "updates" }} className="ml-auto rounded-md px-2 py-1 text-xs text-primary underline underline-offset-4">
      {t("settings.updates.indicator", { version: state.release.version })}
    </Link>
  ) : null
}
