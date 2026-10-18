import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

export type WithChildren = { children: ReactNode }

export type AccentProviderProps = WithChildren

export type PageProps = {
  title: string
  description?: string
  actions?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
}

export type PageSectionProps = {
  title?: string
  action?: ReactNode
  className?: string
  children: ReactNode
}

export type PanelProps = {
  title: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
  contentClassName?: string
  children: ReactNode
}

export type StatusProps = { value: string }

export type StatCardProps = {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint?: string
}

export type StatusTone = "success" | "info" | "warning" | "danger" | "neutral" | "brand"

export type StatusBadgeProps = { label: string; tone?: StatusTone }

export type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export type DataStateProps = {
  isLoading: boolean
  error: unknown
  isEmpty?: boolean
  empty?: ReactNode
  loading?: ReactNode
  children: ReactNode
}

export type FormFieldProps = {
  label: string
  htmlFor: string
  hint?: string
  className?: string
  children: ReactNode
}

export type RowAction = { label: string; onSelect: () => void; destructive?: boolean; icon?: LucideIcon }

export type RowActionsProps = { label: string; actions: RowAction[] }

export type TagListProps = { tags: string[]; className?: string }

export type DialogFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  submitLabel: string
  isPending: boolean
  error?: unknown
  onSubmit: () => void
  footer?: ReactNode
  children: ReactNode
}

export type SelectOption<T extends string = string> = { value: T; label: string }

export type SelectFieldProps<T extends string> = {
  id: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
}

export type SegmentedOption<T extends string> = { value: T; label: string; count?: number }

export type SegmentedControlProps<T extends string> = {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
}

export type SearchInputProps = { value: string; onChange: (value: string) => void; placeholder: string }
