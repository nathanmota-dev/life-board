import { toast } from "sonner"
import type { AppNotification } from "@/types/notification"

async function showBrowserNotification({ title, body }: AppNotification) {
  if (typeof Notification === "undefined") return false
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission
  if (permission !== "granted") return false
  new Notification(title, { body })
  return true
}

/**
 * The app-wide notification service. In Electron it shows a native OS
 * notification (clicking it opens `route`); in a plain browser it uses the
 * Notification API; and when neither is available it falls back to a toast.
 */
export async function notify(notification: AppNotification) {
  const desktop = window.desktop?.notifications
  const shown = desktop ? await desktop.show(notification) : await showBrowserNotification(notification)
  if (!shown) toast(notification.title, { description: notification.body })
}
