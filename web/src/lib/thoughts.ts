import { parseTags } from "@/lib/format"
import { i18n } from "@/lib/i18n"
import type { Thought, ThoughtFormValues, ThoughtInput } from "@/types/thought"

export function thoughtTitle(thought: Thought) {
  return thought.title || stripHtml(thought.body).slice(0, 60) || i18n.t("thoughts.untitled")
}

export function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function emptyThoughtValues(): ThoughtFormValues {
  return { title: "", body: "", tags: "", pinned: false, linkedTaskIds: [] }
}

export function thoughtToValues(thought: Thought): ThoughtFormValues {
  return {
    title: thought.title ?? "",
    body: thought.body,
    tags: thought.tags.join(", "),
    pinned: thought.pinned,
    linkedTaskIds: thought.linkedTaskIds,
  }
}

export function valuesToThoughtInput(values: ThoughtFormValues): ThoughtInput {
  return {
    title: values.title.trim() || null,
    body: values.body.trim(),
    tags: parseTags(values.tags),
    pinned: values.pinned,
    linkedTaskIds: values.linkedTaskIds,
  }
}
