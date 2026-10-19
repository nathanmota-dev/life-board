export type AppNotification = {
  title: string
  body?: string
  /** In-app route opened when the notification is clicked, e.g. "/pomodoro". */
  route?: string
  silent?: boolean
}
