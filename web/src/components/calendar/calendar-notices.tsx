import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useCalendarNotice } from "@/components/calendarcn/calendar-provider"

/** Shows the calendar view's notices ("Event deleted", with Undo) as the app's toasts. */
export function CalendarNotices() {
  const { t } = useTranslation()
  const { notice, dismissNotice } = useCalendarNotice()

  useEffect(() => {
    if (!notice) return
    const dismiss = () => dismissNotice(notice.id)
    toast(notice.message, {
      id: "calendar-notice",
      description: notice.title ? `“${notice.title}”` : undefined,
      action: notice.onUndo ? { label: t("common.undo"), onClick: notice.onUndo } : undefined,
      onDismiss: dismiss,
      onAutoClose: dismiss,
    })
  }, [notice, dismissNotice, t])

  return null
}
