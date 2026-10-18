import type { AllDayChipProps } from "@/types/calendar"

export function AllDayChip({ event, onOpen }: AllDayChipProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className="w-full cursor-pointer truncate rounded-sm border-l-[3px] px-1.5 py-0.5 text-left text-[11px] font-medium"
      style={{ borderLeftColor: event.color, backgroundColor: `color-mix(in oklab, ${event.color} 12%, var(--card))` }}
    >
      {event.title}
    </button>
  )
}
