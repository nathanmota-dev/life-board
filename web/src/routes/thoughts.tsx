import { useDeferredValue, useState } from "react"
import { Lightbulb, Plus } from "lucide-react"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SearchInput } from "@/components/shared/search-input"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { ThoughtFormDialog } from "@/components/thoughts/thought-form-dialog"
import { ThoughtGrid } from "@/components/thoughts/thought-grid"
import { Button } from "@/components/ui/button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useThoughts } from "@/hooks/queries/use-thoughts"
import type { Thought, ThoughtDialogState, ThoughtView } from "@/types/thought"

export function ThoughtsPage() {
  const [view, setView] = useState<ThoughtView>("all")
  const [search, setSearch] = useState("")
  const [dialog, setDialog] = useState<ThoughtDialogState>({ open: false, thought: null })
  const thoughts = useThoughts({ search: useDeferredValue(search.trim()), pinned: view === "pinned" ? true : undefined, limit: 24 })
  const items = thoughts.data ?? []
  const openDialog = (thought: Thought | null) => setDialog({ open: true, thought })

  return (
    <Page
      title="Thoughts"
      description="Ideas, notes and anything worth remembering."
      actions={
        <Button size="sm" onClick={() => openDialog(null)}>
          <Plus />
          New thought
        </Button>
      }
      toolbar={
        <>
          <SegmentedControl
            label="Thought views"
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All" },
              { value: "pinned", label: "Pinned" },
            ]}
          />
          <SearchInput value={search} onChange={setSearch} placeholder="Search thoughts" />
        </>
      }
    >
      <PageSection>
        <DataState
          isLoading={thoughts.isLoading}
          error={thoughts.error}
          isEmpty={items.length === 0}
          empty={<EmptyState icon={Lightbulb} title="No thoughts yet" description="Capture an idea to see it here." />}
        >
          <ThoughtGrid thoughts={items} onEdit={openDialog} />
          {thoughts.hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" disabled={thoughts.isFetchingNextPage} onClick={() => thoughts.fetchNextPage()}>
                Load more
              </Button>
            </div>
          ) : null}
        </DataState>
      </PageSection>
      <ThoughtFormDialog
        key={`${dialog.thought?.id ?? "new"}-${dialog.open}`}
        open={dialog.open}
        thought={dialog.thought}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Page>
  )
}
