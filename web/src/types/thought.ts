export type Thought = {
  id: string
  title: string | null
  body: string
  tags: string[]
  pinned: boolean
  linkedTaskIds: string[]
  createdAt: string
  updatedAt: string
}

export type ThoughtInput = {
  title?: string | null
  body?: string
  tags?: string[]
  pinned?: boolean
  linkedTaskIds?: string[]
}

export type ThoughtFilters = {
  search?: string
  tag?: string
  pinned?: boolean
  limit?: number
}

export type ThoughtPage = { items: Thought[]; nextCursor: string | null }

export type ThoughtView = "all" | "pinned"

export type ThoughtFormValues = { title: string; body: string; tags: string; pinned: boolean; linkedTaskIds: string[] }

export type ThoughtCardProps = { thought: Thought; onEdit: (thought: Thought) => void }

export type ThoughtGridProps = { thoughts: Thought[]; onEdit: (thought: Thought) => void }

export type ThoughtFormDialogProps = { open: boolean; thought: Thought | null; onOpenChange: (open: boolean) => void }

export type TaskPickerProps = { selected: string[]; onChange: (ids: string[]) => void }

export type ThoughtDialogState = { open: boolean; thought: Thought | null }
