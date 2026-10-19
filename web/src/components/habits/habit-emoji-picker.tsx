import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/shared/form-field"
import { HABIT_EMOJIS } from "@/lib/habits"
import { cn } from "@/lib/utils"
import type { HabitEmojiPickerProps } from "@/types/habit"

export function HabitEmojiPicker({ value, onChange }: HabitEmojiPickerProps) {
  const { t } = useTranslation()
  return (
    <FormField label={t("habits.emoji")} htmlFor="habit-emoji">
      <div className="flex items-start gap-3">
        <Input id="habit-emoji" value={value} onChange={(event) => onChange(event.target.value)} maxLength={32} required className="size-14 shrink-0 text-center text-2xl md:text-2xl" />
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("habits.chooseEmoji")}>
          {HABIT_EMOJIS.map((emoji) => (
            <button type="button" key={emoji} aria-label={emoji} aria-pressed={value === emoji} onClick={() => onChange(emoji)}
              className={cn("flex size-8 cursor-pointer items-center justify-center rounded-md text-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring", value === emoji && "bg-primary/15 ring-1 ring-primary")}>{emoji}</button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("habits.emojiHint")}</p>
    </FormField>
  )
}
