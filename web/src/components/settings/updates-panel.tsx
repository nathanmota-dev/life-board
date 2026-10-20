import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Panel } from "@/components/workspace-ui"
import { useAppUpdates } from "@/hooks/use-app-updates"
import { getLocale } from "@/lib/i18n"

export function UpdatesPanel() {
  const { t } = useTranslation()
  const { state, run } = useAppUpdates()
  const [confirm, setConfirm] = useState(false)
  const busy = ["checking", "downloading", "installing"].includes(state.status)
  const ready = state.status === "ready" || (state.status === "error" && state.retryAction === "install")
  const downloadable = state.status === "available" || (state.status === "error" && state.retryAction === "download")
  const date = (value: number | string | null) => value === null ? t("settings.updates.never") : new Date(value).toLocaleString(getLocale())

  return (
    <Panel title={t("settings.updates.title")}>
      <div className="flex min-w-0 flex-col gap-4" aria-busy={busy}>
        <p className="text-sm text-muted-foreground">{t("settings.updates.description")}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{t("settings.updates.installed")}</dt><dd>{state.installedVersion}{state.format ? ` (${state.format})` : ""}</dd></div>
          <div><dt className="text-muted-foreground">{t("settings.updates.lastCheck")}</dt><dd>{date(state.lastSuccess)}</dd></div>
          {state.release && <>
            <div><dt className="text-muted-foreground">{t("settings.updates.availableVersion")}</dt><dd>{state.release.version}</dd></div>
            {state.release.releaseDate && <div><dt className="text-muted-foreground">{t("settings.updates.releaseDate")}</dt><dd>{date(state.release.releaseDate)}</dd></div>}
          </>}
        </dl>
        <p role="status" className="text-sm">{t(`settings.updates.states.${state.status}`)}</p>
        {state.error && <p role="alert" className="text-sm text-destructive">{t(`settings.updates.errors.${state.error}`)}</p>}
        {state.status === "downloading" && <div className="flex items-center gap-3">
          <progress className="h-2 w-full accent-primary" aria-label={t("settings.updates.progress")} value={state.progress ?? 0} max={100} />
          <span className="text-sm tabular-nums">{Math.round(state.progress ?? 0)}%</span>
        </div>}
        {state.release && <div className="min-w-0 space-y-3">
          {state.release.notes && <p className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">{state.release.notes}</p>}
          <a className="text-sm text-primary underline underline-offset-4" href={state.release.url} onClick={(event) => {
            if (window.desktop) { event.preventDefault(); void window.desktop.openExternal(state.release!.url) }
          }} target="_blank" rel="noreferrer">{t("settings.updates.releaseNotes")}</a>
        </div>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || ready || state.status === "unavailable"} onClick={() => void run("check")}>{t("settings.updates.check")}</Button>
          {downloadable && <Button disabled={busy} onClick={() => void run("download")}>{t("settings.updates.download")}</Button>}
          {ready && <Button disabled={busy} onClick={() => setConfirm(true)}>{t("settings.updates.install")}</Button>}
        </div>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.updates.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("settings.updates.confirmDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => { setConfirm(false); void run("install") }}>{t("settings.updates.install")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
