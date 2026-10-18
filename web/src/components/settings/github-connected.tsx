import { useTranslation } from "react-i18next"
import { RefreshCw, Unplug } from "lucide-react"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { useDisconnectGithub, useSyncGithub } from "@/hooks/queries/use-github"
import { formatDate, formatTime } from "@/lib/dates"
import { errorMessage } from "@/lib/format"
import type { GithubConnectedProps } from "@/types/github"

export function GithubConnected({ status }: GithubConnectedProps) {
  const { t } = useTranslation()
  const sync = useSyncGithub()
  const disconnect = useDisconnectGithub()
  const lastSync = status.lastSyncAt
    ? t("settings.github.syncedAt", {
        date: formatDate(status.lastSyncAt),
        time: formatTime(status.lastSyncAt),
      })
    : t("settings.github.never")

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y rounded-xl border text-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <dt className="text-muted-foreground">{t("settings.github.account")}</dt>
          <dd className="font-medium">@{status.login}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <dt className="text-muted-foreground">{t("settings.github.status")}</dt>
          <dd>
            <StatusBadge label={status.lastSyncError ? t("settings.github.syncFailed") : t("settings.github.connected")} tone={status.lastSyncError ? "danger" : "success"} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <dt className="text-muted-foreground">{t("settings.github.lastSync")}</dt>
          <dd>{lastSync}</dd>
        </div>
      </dl>
      {status.lastSyncError ? <p className="text-sm text-destructive">{status.lastSyncError}</p> : null}
      {sync.error ? <p className="text-sm text-destructive">{errorMessage(sync.error)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={sync.isPending} onClick={() => sync.mutate(undefined)}>
          <RefreshCw className={sync.isPending ? "animate-spin" : undefined} />
          {t("settings.github.sync")}
        </Button>
        <Button variant="outline" disabled={disconnect.isPending} onClick={() => disconnect.mutate(undefined)}>
          <Unplug />
          {t("settings.github.disconnect")}
        </Button>
      </div>
    </div>
  )
}
