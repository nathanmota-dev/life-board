import { RefreshCw, Unplug } from "lucide-react"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { useDisconnectGithub, useSyncGithub } from "@/hooks/queries/use-github"
import { formatDate, formatTime } from "@/lib/dates"
import { errorMessage } from "@/lib/format"
import type { GithubConnectedProps } from "@/types/github"

export function GithubConnected({ status }: GithubConnectedProps) {
  const sync = useSyncGithub()
  const disconnect = useDisconnectGithub()
  const lastSync = status.lastSyncAt ? `${formatDate(status.lastSyncAt)} at ${formatTime(status.lastSyncAt)}` : "Never"

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y rounded-xl border text-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <dt className="text-muted-foreground">Account</dt>
          <dd className="font-medium">@{status.login}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <StatusBadge label={status.lastSyncError ? "Sync failed" : "Connected"} tone={status.lastSyncError ? "danger" : "success"} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <dt className="text-muted-foreground">Last sync</dt>
          <dd>{lastSync}</dd>
        </div>
      </dl>
      {status.lastSyncError ? <p className="text-sm text-destructive">{status.lastSyncError}</p> : null}
      {sync.error ? <p className="text-sm text-destructive">{errorMessage(sync.error)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={sync.isPending} onClick={() => sync.mutate(undefined)}>
          <RefreshCw className={sync.isPending ? "animate-spin" : undefined} />
          Sync now
        </Button>
        <Button variant="outline" disabled={disconnect.isPending} onClick={() => disconnect.mutate(undefined)}>
          <Unplug />
          Disconnect
        </Button>
      </div>
    </div>
  )
}
