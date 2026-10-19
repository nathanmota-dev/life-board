import { ipcMain, Notification } from "electron"

// The app-wide notification service: native OS notifications that open the app
// at a given route when clicked. The renderer reaches it through `notification:show`.

export type AppNotification = {
  title: string
  body?: string
  /** In-app route opened when the notification is clicked, e.g. "/pomodoro". */
  route?: string
  silent?: boolean
}

type OpenRoute = (route?: string) => void

let icon: string | undefined
let openRoute: OpenRoute = () => {}
// Without a reference, a shown notification can be garbage-collected and lose its click handler.
const visible = new Set<Notification>()

const ROUTE_PATTERN = /^\/[a-z0-9-/]*$/

function parseNotification(value: unknown): AppNotification | null {
  const input = value as Partial<AppNotification> | null
  if (!input || typeof input !== "object" || typeof input.title !== "string" || !input.title.trim()) return null
  return {
    title: input.title.slice(0, 120),
    body: typeof input.body === "string" ? input.body.slice(0, 400) : undefined,
    route: typeof input.route === "string" && ROUTE_PATTERN.test(input.route) ? input.route : undefined,
    silent: input.silent === true,
  }
}

/** Shows a native notification; returns false where the OS has no notification support. */
export function showNotification({ title, body, route, silent }: AppNotification) {
  if (!Notification.isSupported()) return false

  const notification = new Notification({ title, body: body ?? "", icon, silent })
  visible.add(notification)
  const release = () => visible.delete(notification)
  notification.on("click", () => {
    release()
    openRoute(route)
  })
  notification.on("close", release)
  notification.on("failed", release)
  notification.show()
  return true
}

export function registerNotifications(appIcon: string, onOpen: OpenRoute) {
  icon = appIcon
  openRoute = onOpen
  ipcMain.handle("notification:show", (_event, value: unknown) => {
    const notification = parseNotification(value)
    return notification ? showNotification(notification) : false
  })
}
