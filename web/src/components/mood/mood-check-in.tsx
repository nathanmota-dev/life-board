import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useSaveMood } from "@/hooks/queries/use-mood"
import { errorMessage } from "@/lib/format"
import { MOOD_OPTIONS } from "@/lib/mood"
import { cn } from "@/lib/utils"
import type { MoodCheckInProps } from "@/types/mood"

export function MoodCheckIn({ today }: MoodCheckInProps) {
  const [score, setScore] = useState(today.entry?.score ?? 0)
  const [note, setNote] = useState(today.entry?.note ?? "")
  const save = useSaveMood()

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (score) save.mutate({ score, note: note.trim() || null, day: today.day })
      }}
    >
      <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Today's mood">
        {MOOD_OPTIONS.map((option) => (
          <button
            key={option.score}
            type="button"
            role="radio"
            aria-checked={score === option.score}
            onClick={() => setScore(option.score)}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring",
              score === option.score && "border-primary bg-primary/10 font-medium text-foreground",
            )}
          >
            <span className="text-2xl" aria-hidden="true">{option.emoji}</span>
            {option.label}
          </button>
        ))}
      </div>
      <Textarea aria-label="Note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth remembering about today?" />
      {save.error ? <p className="text-sm text-destructive">{errorMessage(save.error)}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{today.entry ? "You can update today's entry until midnight." : "One entry per day."}</p>
        <Button type="submit" disabled={!score || save.isPending}>
          {today.entry ? "Update" : "Save mood"}
        </Button>
      </div>
    </form>
  )
}
