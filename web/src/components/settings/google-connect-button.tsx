import { useTranslation } from "react-i18next"
import { LoaderCircle, LogIn, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCancelGoogleConnect, useConnectGoogle } from "@/hooks/queries/use-google"
import { errorMessage } from "@/lib/format"
import type { GoogleConnectButtonProps } from "@/types/google"

/** Waits for the browser login with a Cancel button. */
function GoogleWaiting() {
  const { t } = useTranslation()
  const cancel = useCancelGoogleConnect()

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4" role="status">
      <p className="flex items-center gap-2 text-sm">
        <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
        {t("settings.google.waiting")}
      </p>
      {cancel.error ? <p className="text-sm text-destructive">{errorMessage(cancel.error)}</p> : null}
      <div>
        <Button variant="outline" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate(undefined)}>
          <X />
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  )
}

/** Connect (or Reconnect): opens Google's consent page in the default browser. */
export function GoogleConnectButton({ pending, reconnect = false }: GoogleConnectButtonProps) {
  const { t } = useTranslation()
  const connect = useConnectGoogle()
  const label = reconnect ? t("settings.google.reconnect") : t("settings.google.connect")

  return pending ? (
    <GoogleWaiting />
  ) : (
    <div className="flex flex-col gap-2">
      {connect.error ? <p className="text-sm text-destructive">{errorMessage(connect.error)}</p> : null}
      <div>
        <Button disabled={connect.isPending} onClick={() => connect.mutate(undefined)}>
          <LogIn />
          {connect.isPending ? t("settings.google.opening") : label}
        </Button>
      </div>
    </div>
  )
}
