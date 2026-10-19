import { useTranslation } from "react-i18next"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { useCreateProject } from "@/hooks/queries/use-projects"
import { errorMessage } from "@/lib/format"

/** Creates an idea on Enter, at the top of the Idea column. */
export function ProjectQuickAdd() {
  const { t } = useTranslation()
  const [title, setTitle] = useState("")
  const create = useCreateProject()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = title.trim()
    if (value) {
      create.mutate(
        { title: value, status: "idea" },
        { onSuccess: () => setTitle(""), onError: (error) => toast.error(errorMessage(error)) },
      )
    }
  }

  return (
    <form onSubmit={submit}>
      <Input
        aria-label={t("projects.newIdea")}
        placeholder={t("projects.newIdeaPlaceholder")}
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="h-8 bg-background"
      />
    </form>
  )
}
