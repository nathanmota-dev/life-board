import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useRemoveMood } from "@/hooks/queries/use-mood"
import { formatDate, fromDayKey } from "@/lib/dates"
import { moodOption } from "@/lib/mood"
import type { MoodEntriesProps } from "@/types/mood"

export function MoodEntries({ entries }: MoodEntriesProps) {
  const remove = useRemoveMood()

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Day</TableHead>
            <TableHead>Mood</TableHead>
            <TableHead>Note</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="pl-4 text-sm whitespace-nowrap">{formatDate(fromDayKey(entry.day), { weekday: "short", month: "short", day: "numeric" })}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium">
                  {moodOption(entry.score).emoji} {moodOption(entry.score).label}
                </span>
              </TableCell>
              <TableCell className="max-w-0 truncate text-sm text-muted-foreground">{entry.note || "—"}</TableCell>
              <TableCell className="pr-3">
                <Button variant="ghost" size="icon-sm" aria-label={`Delete entry for ${entry.day}`} onClick={() => remove.mutate(entry.id)}>
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
