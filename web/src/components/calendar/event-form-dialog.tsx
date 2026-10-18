import { useState } from "react"
import { Trash2 } from "lucide-react"
import { EventFormFields } from "@/components/calendar/event-form-fields"
import { DialogForm } from "@/components/shared/dialog-form"
import { Button } from "@/components/ui/button"
import { useCreateEvent, useRemoveEvent, useUpdateEvent } from "@/hooks/queries/use-calendar"
import { emptyEventValues, eventToValues, valuesToEventInput } from "@/lib/calendar"
import type { EventFormDialogProps } from "@/types/calendar"

export function EventFormDialog({ open, event, start, onOpenChange }: EventFormDialogProps) {
  const [values, setValues] = useState(() => (event ? eventToValues(event) : emptyEventValues(start)))
  const create = useCreateEvent()
  const update = useUpdateEvent()
  const remove = useRemoveEvent()
  const mutation = event ? update : create
  const close = { onSuccess: () => onOpenChange(false) }

  const submit = () => {
    const input = valuesToEventInput(values)
    if (input.title) {
      if (event) update.mutate({ id: event.id, input }, close)
      else create.mutate(input, close)
    }
  }

  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={event ? "Edit event" : "New event"}
      submitLabel={event ? "Save" : "Create event"}
      isPending={mutation.isPending}
      error={mutation.error ?? remove.error}
      onSubmit={submit}
      footer={
        event ? (
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => remove.mutate(event.id, close)}>
            <Trash2 />
            Delete
          </Button>
        ) : null
      }
    >
      <EventFormFields values={values} onChange={setValues} />
    </DialogForm>
  )
}
