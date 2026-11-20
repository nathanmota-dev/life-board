import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import type { PageTitleInputProps } from "@/types/page"

/** A title being typed in place: Enter saves, Esc cancels, and an empty title is refused. */
export function PageTitleInput({ initial = "", label, onSubmit, onCancel }: PageTitleInputProps) {
  const [value, setValue] = useState(initial)
  const [invalid, setInvalid] = useState(false)
  const finished = useRef(false)

  function finish(title: string, keepOpenWhenEmpty: boolean) {
    if (finished.current) return
    const trimmed = title.trim()
    if (!trimmed) {
      if (keepOpenWhenEmpty) setInvalid(true)
      else {
        finished.current = true
        onCancel()
      }
      return
    }
    finished.current = true
    if (trimmed === initial) onCancel()
    else onSubmit(trimmed)
  }

  return (
    <Input
      autoFocus
      value={value}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className="h-7 min-w-0 flex-1 px-2 text-sm"
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        setValue(event.target.value)
        setInvalid(false)
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === "Enter") {
          event.preventDefault()
          finish(value, true)
        } else if (event.key === "Escape") {
          event.preventDefault()
          finished.current = true
          onCancel()
        }
      }}
      onBlur={() => finish(value, false)}
    />
  )
}
