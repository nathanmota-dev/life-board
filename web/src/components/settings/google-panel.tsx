import { useTranslation } from "react-i18next"
import { CalendarDays } from "lucide-react"
import { DataState } from "@/components/shared/data-state"
import { GoogleConnected } from "@/components/settings/google-connected"
import { GoogleCredentialsForm } from "@/components/settings/google-credentials-form"
import { GoogleReadyToConnect } from "@/components/settings/google-ready-to-connect"
import { Panel } from "@/components/workspace-ui"
import { useGoogleStatus } from "@/hooks/queries/use-google"
import type { GoogleStatusProps } from "@/types/google"

function GoogleStatusView({ status }: GoogleStatusProps) {
  return status.connected || status.reauthRequired ? (
    <GoogleConnected status={status} />
  ) : status.hasCredentials ? (
    <GoogleReadyToConnect status={status} />
  ) : (
    <GoogleCredentialsForm />
  )
}

export function GooglePanel() {
  const { t } = useTranslation()
  const status = useGoogleStatus()

  return (
    <Panel title={t("settings.google.title")} icon={CalendarDays} className="max-w-2xl">
      <DataState isLoading={status.isLoading} error={status.error}>
        {status.data ? <GoogleStatusView status={status.data} /> : null}
      </DataState>
    </Panel>
  )
}
