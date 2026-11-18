import { useTranslation } from "react-i18next"
import { Unplug } from "lucide-react"
import { GoogleConnectButton } from "@/components/settings/google-connect-button"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { useDisconnectGoogle } from "@/hooks/queries/use-google"
import { formatDate, formatTime } from "@/lib/dates"
import { errorMessage } from "@/lib/format"
import type { GoogleDetailRow, GoogleStatusProps } from "@/types/google"

/** The connected account; Reconnect when Google refused the stored authorization. */
export function GoogleConnected({ status }: GoogleStatusProps) {
  const { t } = useTranslation()
  const disconnect = useDisconnectGoogle()
  const rows: GoogleDetailRow[] = [
    { label: t("settings.google.account"), value: <span className="font-medium break-all">{status.email}</span> },
    {
      label: t("settings.google.status"),
      value: status.reauthRequired ? (
        <StatusBadge label={t("settings.google.reauthRequired")} tone="danger" />
      ) : (
        <StatusBadge label={t("settings.google.connected")} tone="success" />
      ),
    },
    {
      label: t("settings.google.lastSync"),
      value: status.lastSyncAt
        ? t("settings.google.syncedAt", { date: formatDate(status.lastSyncAt), time: formatTime(status.lastSyncAt) })
        : t("settings.google.never"),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y rounded-xl border text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
      {status.reauthRequired ? <p className="text-sm text-destructive">{t("settings.google.reauthDescription")}</p> : null}
      {status.reauthRequired ? <GoogleConnectButton pending={status.pending} reconnect /> : null}
      {disconnect.error ? <p className="text-sm text-destructive">{errorMessage(disconnect.error)}</p> : null}
      <div>
        <Button variant="outline" disabled={disconnect.isPending} onClick={() => disconnect.mutate(undefined)}>
          <Unplug />
          {disconnect.isPending ? t("settings.google.disconnecting") : t("settings.google.disconnect")}
        </Button>
      </div>
    </div>
  )
}
