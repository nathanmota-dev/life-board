import { useTranslation } from "react-i18next"
import { getLocale } from "@/lib/i18n"
import type { StatCardProps } from "@/types/ui"

export function StatCard({ icon: Icon, label, value, hint }: StatCardProps) {
  useTranslation()

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0 text-primary" strokeWidth={1.8} />
        <span className="truncate">{label}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold tabular-nums">{typeof value === "number" ? new Intl.NumberFormat(getLocale()).format(value) : value}</p>
        {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )
}
