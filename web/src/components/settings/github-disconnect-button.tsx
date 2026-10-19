import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Unplug } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useDisconnectGithub } from "@/hooks/queries/use-github"
import { errorMessage } from "@/lib/format"
import type { GithubDisconnectButtonProps } from "@/types/github"

/** Asks before deleting the stored token, since reconnecting means pasting it again. */
export function GithubDisconnectButton({ login }: GithubDisconnectButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const disconnect = useDisconnectGithub()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) disconnect.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Unplug />
          {t("settings.github.disconnect")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw_-_2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.github.disconnectTitle")}</DialogTitle>
          <DialogDescription>{t("settings.github.disconnectDescription", { login })}</DialogDescription>
        </DialogHeader>
        {disconnect.error ? <p className="text-sm text-destructive">{errorMessage(disconnect.error)}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate(undefined, { onSuccess: () => setOpen(false) })}
          >
            <Unplug />
            {disconnect.isPending ? t("settings.github.disconnecting") : t("settings.github.disconnectConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
