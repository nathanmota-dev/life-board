import { CircleAlert } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shared/empty-state"
import { errorMessage } from "@/lib/format"
import type { DataStateProps } from "@/types/ui"

const defaultLoading = (
  <div className="flex flex-col gap-2" aria-label="Loading">
    <Skeleton className="h-10 w-full rounded-lg" />
    <Skeleton className="h-10 w-full rounded-lg" />
    <Skeleton className="h-10 w-2/3 rounded-lg" />
  </div>
)

/** Renders loading, error or empty placeholders, and the content once data is there. */
export function DataState({ isLoading, error, isEmpty = false, empty, loading = defaultLoading, children }: DataStateProps) {
  return isLoading ? (
    loading
  ) : error ? (
    <EmptyState icon={CircleAlert} title="Couldn't load this" description={errorMessage(error)} />
  ) : isEmpty ? (
    empty
  ) : (
    children
  )
}
