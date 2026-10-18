export type TagSummary = { name: string; tasks: number; thoughts: number; total: number }

export type TagCloudProps = { tags: TagSummary[]; selected: string | null; onSelect: (tag: string) => void }

export type TagDetailProps = { tag: string }
