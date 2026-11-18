import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** A month grid of days (react-day-picker) in the app's theme. */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames()

  return (
    <DayPicker
      data-slot="calendar"
      showOutsideDays={showOutsideDays}
      className={cn("w-fit p-1 [--cell-size:--spacing(8)]", className)}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4", defaults.months),
        month: cn("flex w-full flex-col gap-3", defaults.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-between", defaults.nav),
        button_previous: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-(--cell-size) p-0", defaults.button_previous),
        button_next: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-(--cell-size) p-0", defaults.button_next),
        month_caption: cn("flex h-(--cell-size) items-center justify-center px-(--cell-size)", defaults.month_caption),
        caption_label: cn("text-sm font-medium capitalize select-none", defaults.caption_label),
        month_grid: cn("w-full border-collapse", defaults.month_grid),
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn("w-(--cell-size) text-[0.8rem] font-normal text-muted-foreground capitalize select-none", defaults.weekday),
        week: cn("mt-1 flex w-full", defaults.week),
        day: cn("size-(--cell-size) p-0 text-center", defaults.day),
        day_button: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-(--cell-size) p-0 font-normal", defaults.day_button),
        today: cn("[&>button]:bg-accent [&>button]:text-accent-foreground", defaults.today),
        selected: cn("[&>button]:bg-primary! [&>button]:text-primary-foreground!", defaults.selected),
        outside: cn("text-muted-foreground", defaults.outside),
        disabled: cn("text-muted-foreground opacity-50", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevronClass, orientation }) =>
          orientation === "left" ? <ChevronLeftIcon className={cn("size-4", chevronClass)} /> : <ChevronRightIcon className={cn("size-4", chevronClass)} />,
      }}
      {...props}
    />
  )
}

export { Calendar }
