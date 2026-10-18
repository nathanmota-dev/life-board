import { useTranslation } from "react-i18next"
import { GoalDetailBody } from "@/components/goals/goal-detail-body"
import { DataState } from "@/components/shared/data-state"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useGoal } from "@/hooks/queries/use-goals"
import type { GoalDetailSheetProps } from "@/types/goal"

export function GoalDetailSheet({ goalId, onClose, onEdit }: GoalDetailSheetProps) {
  const { t } = useTranslation()
  const detail = useGoal(goalId)

  return (
    <Sheet open={goalId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md" aria-describedby={undefined}>
        <DataState
          isLoading={detail.isLoading}
          error={detail.error}
          loading={<SheetTitle className="p-5 text-sm text-muted-foreground">{t("goals.loadingGoal")}</SheetTitle>}
        >
          {detail.data ? <GoalDetailBody detail={detail.data} onClose={onClose} onEdit={onEdit} /> : null}
        </DataState>
      </SheetContent>
    </Sheet>
  )
}
