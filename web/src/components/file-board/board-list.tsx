import { useTranslation } from "react-i18next"
import { ChevronRight, Layers } from "lucide-react"
import { formatRelativeDay } from "@/lib/dates"
import { cn } from "@/lib/utils"
import type { BoardListProps } from "@/types/file-board"

export function BoardList({ boards, selectedId, onSelect }: BoardListProps) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-col divide-y">
      {boards.map((board) => (
        <li key={board.id}>
          <button
            type="button"
            aria-current={board.id === selectedId ? "true" : undefined}
            onClick={() => onSelect(board.id)}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-muted/60",
              board.id === selectedId && "bg-muted/80",
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Layers className="size-5" strokeWidth={1.7} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{board.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {t("fileBoard.updatedOn", { kind: t(`boardKinds.${board.kind}`), date: formatRelativeDay(board.updatedAt) })}
              </span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  )
}
