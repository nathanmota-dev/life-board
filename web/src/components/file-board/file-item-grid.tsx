import { FileItemCard } from "@/components/file-board/file-item-card"
import type { FileItemGridProps } from "@/types/file-board"

export function FileItemGrid({ items, onOpen }: FileItemGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => (
        <FileItemCard key={item.id} item={item} onOpen={onOpen} />
      ))}
    </div>
  )
}
