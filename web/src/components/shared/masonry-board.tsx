import { Fragment } from "react"
import { useColumnCount } from "@/hooks/use-column-count"
import { distributeColumns } from "@/lib/masonry"
import type { MasonryBoardProps } from "@/types/ui"

/** Loose columns of cards with their own heights, as many as the width allows. */
export function MasonryBoard<T>({ items, getKey, renderItem, label }: MasonryBoardProps<T>) {
  const [ref, columns] = useColumnCount()

  return (
    <div ref={ref} aria-label={label} className="flex min-w-0 items-start gap-3">
      {distributeColumns(items, columns).map((column, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col gap-3">
          {column.map((item) => (
            <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
          ))}
        </div>
      ))}
    </div>
  )
}
