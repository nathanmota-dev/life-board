import { useTranslation } from "react-i18next"
import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { SaveTextButtonProps } from "@/types/file-board"

export function SaveTextButton({ onSave }: SaveTextButtonProps) {
  const { t } = useTranslation()
  return (
    <Button type="button" size="sm" onClick={onSave}>
      <Save />
      {t("common.save")}
    </Button>
  )
}
