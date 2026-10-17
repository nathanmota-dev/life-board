import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

export function Page({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-medium">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </header>
      {children}
    </section>
  )
}

export function Panel({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <Card className="min-w-0 gap-4 rounded-2xl py-4 shadow-none">
      <div className="flex items-center justify-between gap-3 px-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {action}
      </div>
      <CardContent className="min-w-0 px-4">{children}</CardContent>
    </Card>
  )
}

export function Status({ value }: { value: string }) {
  return (
    <Badge
      variant="outline"
      className="max-w-full rounded-md bg-muted/30 font-normal"
    >
      {value}
    </Badge>
  )
}
