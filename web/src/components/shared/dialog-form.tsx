import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { errorMessage } from "@/lib/format"
import type { DialogFormProps } from "@/types/ui"

/** A dialog wrapping a form: title, fields, an inline error and Cancel/Submit buttons. */
export function DialogForm({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  isPending,
  error,
  onSubmit,
  footer,
  children,
}: DialogFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={description ? undefined : "sr-only"}>{description ?? title}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">{children}</div>
          {error ? <p className="text-sm text-destructive">{errorMessage(error)}</p> : null}
          <DialogFooter className="items-center sm:justify-between">
            <div>{footer}</div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
