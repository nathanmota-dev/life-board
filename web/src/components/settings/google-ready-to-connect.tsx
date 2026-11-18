import { useTranslation } from "react-i18next"
import { KeyRound } from "lucide-react"
import { GoogleConnectButton } from "@/components/settings/google-connect-button"
import { Button } from "@/components/ui/button"
import { useClearGoogleCredentials } from "@/hooks/queries/use-google"
import { errorMessage } from "@/lib/format"
import type { GoogleStatusProps } from "@/types/google"

/** Credentials saved, no account yet: Connect, or replace the credentials. */
export function GoogleReadyToConnect({ status }: GoogleStatusProps) {
  const { t } = useTranslation()
  const clear = useClearGoogleCredentials()

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("settings.google.readyDescription")}</p>
      <GoogleConnectButton pending={status.pending} />
      {clear.error ? <p className="text-sm text-destructive">{errorMessage(clear.error)}</p> : null}
      <div>
        <Button variant="ghost" size="sm" disabled={clear.isPending} onClick={() => clear.mutate(undefined)}>
          <KeyRound />
          {t("settings.google.changeCredentials")}
        </Button>
      </div>
    </div>
  )
}
