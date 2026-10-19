import { useTranslation } from "react-i18next"
import { Gauge } from "lucide-react"
import { FormField } from "@/components/shared/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ProjectWipLimitProps } from "@/types/project"

export function ProjectWipLimit({ limit, onChange }: ProjectWipLimitProps) {
  const { t } = useTranslation()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" aria-label={t("projects.wipLimit")}>
          <Gauge className="size-3.5" />
          {limit === null ? t("projects.wipLimitOff") : t("projects.wipLimitValue", { limit })}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <FormField label={t("projects.wipLimit")} htmlFor="project-wip-limit" hint={t("projects.wipLimitHint")}>
          <Input
            id="project-wip-limit"
            type="number"
            min={1}
            max={99}
            value={limit ?? ""}
            onChange={(event) => {
              const value = event.target.valueAsNumber
              onChange(Number.isNaN(value) || value < 1 ? null : Math.floor(value))
            }}
          />
        </FormField>
      </PopoverContent>
    </Popover>
  )
}
