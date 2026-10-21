import { useState } from "react"
import { useTranslation } from "react-i18next"
import { FolderOpen } from "lucide-react"
import { FormField } from "@/components/shared/form-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Panel } from "@/components/workspace-ui"
import { useFilesSettings, useUpdateFilesSettings } from "@/hooks/queries/use-files-settings"
import { uploadsDirFor } from "@/lib/files-settings"
import { errorMessage } from "@/lib/format"

export function FilesPanel() {
  const { t } = useTranslation()
  const { data: settings, error: loadError } = useFilesSettings()
  const update = useUpdateFilesSettings()
  // null while the field still shows the saved folder.
  const [draft, setDraft] = useState<string | null>(null)
  const pickDirectory = window.desktop?.app?.pickDirectory
  const location = (draft ?? settings?.baseDir ?? "").trim()
  const error = update.error ?? loadError
  const save = (baseDir: string | null) => update.mutate(baseDir, { onSuccess: () => setDraft(null) })

  return (
    <Panel title={t("settings.files.title")} icon={FolderOpen}>
      <p className="mb-4 text-sm text-muted-foreground">{t("settings.files.description")}</p>
      <form
        className="flex flex-col gap-4"
        aria-busy={update.isPending}
        onSubmit={(event) => {
          event.preventDefault()
          save(location)
        }}
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {t("settings.files.current")}
            {settings && !settings.baseDir ? <Badge variant="secondary">{t("settings.files.default")}</Badge> : null}
          </span>
          <code className="break-all rounded-md bg-muted px-2 py-1.5 text-sm" aria-label={t("settings.files.current")}>
            {settings?.uploadsDir ?? "…"}
          </code>
        </div>
        <FormField
          label={t("settings.files.location")}
          htmlFor="files-location"
          hint={location ? t("settings.files.preview", { path: uploadsDirFor(location) }) : undefined}
        >
          <div className="flex min-w-0 gap-2">
            <Input
              id="files-location"
              className="font-mono"
              placeholder={t("settings.files.placeholder")}
              value={draft ?? settings?.baseDir ?? ""}
              disabled={!settings || update.isPending}
              onChange={(event) => setDraft(event.target.value)}
            />
            {pickDirectory ? (
              <Button
                type="button"
                variant="outline"
                disabled={!settings || update.isPending}
                onClick={() => void pickDirectory().then((dir) => dir && setDraft(dir))}
              >
                <FolderOpen />
                {t("settings.files.choose")}
              </Button>
            ) : null}
          </div>
        </FormField>
        <p className="text-xs text-muted-foreground">{t("settings.files.moveHint")}</p>
        {error ? <p role="alert" className="text-sm text-destructive">{errorMessage(error)}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!settings || update.isPending || !location || location === settings.baseDir}>
            {update.isPending ? t("settings.files.moving") : t("settings.files.save")}
          </Button>
          <Button type="button" variant="outline" disabled={!settings?.baseDir || update.isPending} onClick={() => save(null)}>
            {t("settings.files.reset")}
          </Button>
        </div>
      </form>
    </Panel>
  )
}
