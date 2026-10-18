import { useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { KeyRound } from "lucide-react"
import { FormField } from "@/components/shared/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConnectGithub } from "@/hooks/queries/use-github"
import { errorMessage } from "@/lib/format"

export function GithubTokenForm() {
  const { t } = useTranslation()
  const [token, setToken] = useState("")
  const [orgFilter, setOrgFilter] = useState("")
  const connect = useConnectGithub()

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        connect.mutate({ token: token.trim(), orgFilter: orgFilter.trim() || null }, { onSuccess: () => setToken("") })
      }}
    >
      <p className="text-sm text-muted-foreground">
        <Trans
          i18nKey="settings.github.tokenDescription"
          components={{ code: <code className="rounded bg-muted px-1" /> }}
        />
      </p>
      <FormField label={t("settings.github.token")} htmlFor="github-token">
        <Input
          id="github-token"
          type="password"
          autoComplete="off"
          placeholder="ghp_…"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </FormField>
      <FormField label={t("settings.github.organization")} htmlFor="github-org">
        <Input id="github-org" placeholder={t("settings.github.organizationPlaceholder")} value={orgFilter} onChange={(event) => setOrgFilter(event.target.value)} />
      </FormField>
      {connect.error ? <p className="text-sm text-destructive">{errorMessage(connect.error)}</p> : null}
      <div>
        <Button type="submit" disabled={token.trim().length < 20 || connect.isPending}>
          <KeyRound />
          {connect.isPending ? t("settings.github.checking") : t("settings.github.connect")}
        </Button>
      </div>
    </form>
  )
}
