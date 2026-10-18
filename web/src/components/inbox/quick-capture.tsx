import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Lightbulb, ListTodo, Send } from "lucide-react"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCreateTask } from "@/hooks/queries/use-tasks"
import { useCreateThought } from "@/hooks/queries/use-thoughts"
import { errorMessage } from "@/lib/format"
import type { CaptureKind } from "@/types/inbox"

export function QuickCapture() {
  const { t } = useTranslation()
  const [kind, setKind] = useState<CaptureKind>("task")
  const [text, setText] = useState("")
  const createTask = useCreateTask()
  const createThought = useCreateThought()
  const mutation = kind === "task" ? createTask : createThought
  const reset = { onSuccess: () => setText("") }

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs"
      onSubmit={(event) => {
        event.preventDefault()
        const value = text.trim()
        if (value && kind === "task") createTask.mutate({ title: value, status: "inbox" }, reset)
        else if (value) createThought.mutate({ body: value }, reset)
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          {kind === "task" ? <ListTodo className="size-4 text-primary" /> : <Lightbulb className="size-4 text-primary" />}
          {t("inbox.quickCapture")}
        </p>
        <SegmentedControl
          label={t("inbox.captureAs")}
          value={kind}
          onChange={setKind}
          options={[
            { value: "task", label: t("inbox.task") },
            { value: "thought", label: t("inbox.thought") },
          ]}
        />
      </div>
      <div className="flex gap-2">
        <Input
          aria-label={t("inbox.captureText")}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={kind === "task" ? t("inbox.taskPlaceholder") : t("inbox.thoughtPlaceholder")}
        />
        <Button type="submit" disabled={!text.trim() || mutation.isPending}>
          <Send />
          {t("inbox.capture")}
        </Button>
      </div>
      {mutation.error ? <p className="text-sm text-destructive">{errorMessage(mutation.error)}</p> : null}
    </form>
  )
}
