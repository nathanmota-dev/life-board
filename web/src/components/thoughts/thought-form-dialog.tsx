import { useTranslation } from "react-i18next"
import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { FormField } from "@/components/shared/form-field"
import { TaskPicker } from "@/components/thoughts/task-picker"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCreateThought, useUpdateThought } from "@/hooks/queries/use-thoughts"
import { emptyThoughtValues, thoughtToValues, valuesToThoughtInput } from "@/lib/thoughts"
import type { ThoughtFormDialogProps, ThoughtFormValues } from "@/types/thought"

export function ThoughtFormDialog({ open, thought, onOpenChange }: ThoughtFormDialogProps) {
  const { t } = useTranslation()
  const [values, setValues] = useState(() => (thought ? thoughtToValues(thought) : emptyThoughtValues()))
  const create = useCreateThought()
  const update = useUpdateThought()
  const mutation = thought ? update : create
  const set = <K extends keyof ThoughtFormValues>(field: K, value: ThoughtFormValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }))

  const submit = () => {
    const input = valuesToThoughtInput(values)
    const done = { onSuccess: () => onOpenChange(false) }
    if (input.title || input.body) {
      if (thought) update.mutate({ id: thought.id, input }, done)
      else create.mutate(input, done)
    }
  }

  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={thought ? t("thoughts.editThought") : t("thoughts.newThought")}
      submitLabel={thought ? t("common.save") : t("thoughts.saveThought")}
      isPending={mutation.isPending}
      error={mutation.error}
      onSubmit={submit}
      footer={
        <div className="flex items-center gap-2">
          <Checkbox id="thought-pinned" checked={values.pinned} onCheckedChange={(checked) => set("pinned", checked === true)} />
          <Label htmlFor="thought-pinned" className="font-normal">{t("thoughts.pinToTop")}</Label>
        </div>
      }
    >
      <FormField label={t("common.title")} htmlFor="thought-title">
        <Input id="thought-title" autoFocus value={values.title} onChange={(event) => set("title", event.target.value)} placeholder={t("common.optional")} />
      </FormField>
      <FormField label={t("inbox.thought")} htmlFor="thought-body">
        <Textarea id="thought-body" rows={6} value={values.body} onChange={(event) => set("body", event.target.value)} placeholder={t("thoughts.bodyPlaceholder")} />
      </FormField>
      <FormField label={t("navigation.tags")} htmlFor="thought-tags" hint={t("common.commaSeparated")}>
        <Input id="thought-tags" value={values.tags} onChange={(event) => set("tags", event.target.value)} placeholder={t("thoughts.tagsPlaceholder")} />
      </FormField>
      <FormField label={t("goals.relatedTasks")} htmlFor="thought-tasks">
        <TaskPicker selected={values.linkedTaskIds} onChange={(ids) => set("linkedTaskIds", ids)} />
      </FormField>
    </DialogForm>
  )
}
