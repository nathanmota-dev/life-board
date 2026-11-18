import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ExternalLink, KeyRound } from "lucide-react"
import { FormField } from "@/components/shared/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSaveGoogleCredentials } from "@/hooks/queries/use-google"
import { openExternal } from "@/lib/external"
import { errorMessage } from "@/lib/format"
import { GOOGLE_CONSOLE_URL, isGoogleClientId } from "@/lib/google"

/** The client ID and secret of the user's Google Cloud project, typed once. */
export function GoogleCredentialsForm() {
  const { t } = useTranslation()
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const save = useSaveGoogleCredentials()
  const invalidId = clientId.trim() !== "" && !isGoogleClientId(clientId)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate(
          { clientId: clientId.trim(), clientSecret: clientSecret.trim() },
          { onSuccess: () => setClientSecret("") },
        )
      }}
    >
      <p className="text-sm text-muted-foreground">{t("settings.google.description")}</p>
      <div className="flex flex-col gap-2 rounded-xl border p-4 text-sm">
        <p className="font-medium">{t("settings.google.setupTitle")}</p>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>{t("settings.google.setupProject")}</li>
          <li>{t("settings.google.setupConsent")}</li>
          <li>{t("settings.google.setupClient")}</li>
        </ol>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => openExternal(GOOGLE_CONSOLE_URL)}>
            <ExternalLink />
            {t("settings.google.openConsole")}
          </Button>
        </div>
      </div>
      <FormField
        label={t("settings.google.clientId")}
        htmlFor="google-client-id"
        hint={invalidId ? t("settings.google.clientIdHint") : undefined}
      >
        <Input
          id="google-client-id"
          autoComplete="off"
          placeholder="1234-abcd.apps.googleusercontent.com"
          aria-invalid={invalidId}
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
        />
      </FormField>
      <FormField label={t("settings.google.clientSecret")} htmlFor="google-client-secret" hint={t("settings.google.secretNote")}>
        <Input
          id="google-client-secret"
          type="password"
          autoComplete="off"
          placeholder="GOCSPX-…"
          value={clientSecret}
          onChange={(event) => setClientSecret(event.target.value)}
        />
      </FormField>
      {save.error ? <p className="text-sm text-destructive">{errorMessage(save.error)}</p> : null}
      <div>
        <Button type="submit" disabled={!isGoogleClientId(clientId) || !clientSecret.trim() || save.isPending}>
          <KeyRound />
          {save.isPending ? t("settings.google.saving") : t("settings.google.saveCredentials")}
        </Button>
      </div>
    </form>
  )
}
