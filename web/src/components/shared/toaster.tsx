import { useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { dismissToast, getToasts, subscribeToasts } from "@/lib/toast"

export function Toaster() {
  const { t } = useTranslation()
  const toasts = useSyncExternalStore(subscribeToasts, getToasts)

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border bg-popover py-2 pr-2 pl-4 text-sm text-popover-foreground shadow-lg">
          <span className="min-w-0 flex-1 truncate">{toast.message}</span>
          {toast.action ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-primary"
              onClick={() => {
                toast.action?.onSelect()
                dismissToast(toast.id)
              }}
            >
              {toast.action.label}
            </Button>
          ) : null}
          <Button size="icon-sm" variant="ghost" aria-label={t("common.close")} onClick={() => dismissToast(toast.id)}>
            <X />
          </Button>
        </div>
      ))}
    </div>
  )
}
