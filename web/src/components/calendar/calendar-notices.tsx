import { useEffect, useRef } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useCalendarNotice } from "@/components/calendarcn/calendar-provider"
import { useGoogleCalendarWatch } from "@/hooks/use-google-calendar-watch"
import { googleSyncProblem } from "@/lib/google"

const GOOGLE_NOTICE_ID = "google-sync"
const GOOGLE_CONFLICT_ID = "google-conflict"

/**
 * Shows the calendar view's notices ("Event deleted", with Undo) as the app's toasts,
 * and warns, with a link to Settings, while the Google sync needs attention.
 */
export function CalendarNotices() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { notice, dismissNotice } = useCalendarNotice()
  const status = useGoogleCalendarWatch()
  const problem = googleSyncProblem(status)
  const conflict = status?.lastConflict ?? null
  // A conflict that already happened when the calendar opened isn't announced again.
  const seenConflict = useRef<string | null | undefined>(undefined)

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

  useEffect(() => {
    if (!status) return
    const at = conflict?.at ?? null
    if (conflict && seenConflict.current !== undefined && seenConflict.current !== at) {
      toast.info(t("calendar.conflictKept", { title: conflict.title }), { id: GOOGLE_CONFLICT_ID })
    }
    seenConflict.current = at
  }, [status, conflict, t])

  useEffect(() => {
    if (!problem) return
    toast.warning(t(problem === "reauth" ? "calendar.syncReauth" : "calendar.syncFailed"), {
      id: GOOGLE_NOTICE_ID,
      duration: Number.POSITIVE_INFINITY,
      action: { label: t("calendar.openSettings"), onClick: () => void navigate({ to: "/settings" }) },
    })
    return () => void toast.dismiss(GOOGLE_NOTICE_ID)
  }, [problem, t, navigate])

  return null
}
