"use client";

import * as React from "react";
import { addDays, format } from "date-fns";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PanelLeftIcon,
  PanelRightIcon,
} from "lucide-react";

import { cn } from "@/components/calendarcn/lib/utils";
import { useCalendar, useCalendarConfig } from "@/components/calendarcn/calendar-provider";
import { Button } from "@/components/calendarcn/ui/button";
import { Kbd } from "@/components/calendarcn/ui/kbd";
import { Separator } from "@/components/calendarcn/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/calendarcn/ui/tooltip";
import { ViewDropdown } from "@/components/calendarcn/view-dropdown";
import { AGENDA_DAYS, getFirstShownDay } from "@/components/calendarcn/lib/event-utils";
import { MOD_KEY_LABEL, t } from "@/components/calendarcn/lib/translate";

import type { ViewType } from "@/components/calendarcn/calendar-types";

/** What previous and next move by in each view, for their labels */
/** The period prev/next move by, for their screen reader labels */
function periodLabel(view: ViewType): string {
  return t(`period.${view}`, { count: AGENDA_DAYS });
}

interface CalendarHeaderProps {
  /** Whether the sidebar is open: its toggle's tooltip offers to close or open it */
  sidebarOpen?: boolean;
  /** Opens or closes the sidebar. The sidebar toggle shows only when given */
  onToggleSidebar?: () => void;
  /** Whether the context panel is open. Its toggle hides while it is */
  contextPanelOpen?: boolean;
  /** Opens or closes the context panel. The toggle shows only when given */
  onToggleContextPanel?: () => void;
  /** Shown before the view switcher on wide headers, e.g. the signed-in user's avatar */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The live demo's header: the sidebar toggle, the month and year with the
 * period on screen, then the view switcher, today, previous and next, and
 * the context panel toggle. Reads the calendar from `useCalendar()`, so it
 * goes inside `CalendarProvider`; the panels are your app's, so their state
 * comes in as props.
 */
export function CalendarHeader({
  sidebarOpen = false,
  onToggleSidebar,
  contextPanelOpen = false,
  onToggleContextPanel,
  children,
  className,
}: CalendarHeaderProps) {
  const { monthName, year } = useCalendar();

  return (
    // Tooltips need a provider with Radix; a closer one (yours) still wins
    <TooltipProvider>
      <header
        className={cn(
          "@container/header bg-background sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2",
          className,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 pl-2 @md/header:gap-2 @xl/header:px-4">
          {onToggleSidebar && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    onClick={onToggleSidebar}
                  >
                    <PanelLeftIcon />
                    <span className="sr-only">{t("header.toggleCalendarSidebar")}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {sidebarOpen ? t("header.closeSidebar") : t("header.openSidebar")}{" "}
                  <Kbd className="ml-1">{MOD_KEY_LABEL}</Kbd> <Kbd>/</Kbd>
                </TooltipContent>
              </Tooltip>
              <Separator
                orientation="vertical"
                className="mr-2 hidden data-[orientation=vertical]:h-4 @md/header:block"
              />
            </>
          )}
          <h1 className="min-w-0 truncate text-sm @xs/header:text-base @xl/header:text-xl">
            {/* Narrow headers use the short month ("Sep"); en-US "MMMM" names abbreviate to their first three letters */}
            <span className="font-extrabold @md/header:hidden">
              {monthName.slice(0, 3)}
            </span>
            <span className="hidden font-extrabold @md/header:inline">
              {monthName}
            </span>{" "}
            <span className="font-extrabold">{year}</span>{" "}
            <CalendarPeriodLabel className="text-muted-foreground hidden text-xs @xl/header:inline" />
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1 pr-2 @md/header:gap-2 @xl/header:px-4">
          {children && <div className="hidden @xl/header:flex">{children}</div>}
          <div className="hidden @xs/header:block">
            <CalendarViewSwitcher />
          </div>
          <CalendarNavigation buttonClassName="size-7 @2xs/header:size-8" />
          {onToggleContextPanel && !contextPanelOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={onToggleContextPanel}
                >
                  <PanelRightIcon />
                  <span className="sr-only">{t("header.toggleNavigationSidebar")}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Open context panel <Kbd className="ml-1">/</Kbd>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>
    </TooltipProvider>
  );
}

interface CalendarPeriodLabelProps {
  className?: string;
}

/**
 * The period on screen, for beside the title: the day ("Thursday, Jun 4"),
 * or the agenda's range. While week numbers are on, day and week view add
 * the week's number ("Week 23"), as Notion Calendar shows it beside the
 * title. Empty in month and year view, where the title already says it.
 */
export function CalendarPeriodLabel({ className }: CalendarPeriodLabelProps) {
  const { view, currentDate, weekNumber, viewSettings } = useCalendar();
  const { locale } = useCalendarConfig();
  // The day on screen: with weekends hidden, a Saturday's date shows Monday
  const day = getFirstShownDay(currentDate, viewSettings.showWeekends);
  const showWeekNumber =
    viewSettings.showWeekNumbers && (view === "day" || view === "week");

  return (
    <span className={className}>
      {view === "day" && format(day, "EEEE, MMM d", { locale })}
      {view === "day" && showWeekNumber && " "}
      {showWeekNumber && (
        <span className={cn(view === "day" && "ml-1")}>{t("weekNumber", { week: weekNumber })}</span>
      )}
      {view === "agenda" &&
        `${format(currentDate, "MMM d", { locale })} – ${format(addDays(currentDate, AGENDA_DAYS - 1), "MMM d", { locale })}`}
    </span>
  );
}

/**
 * The view dropdown wired to the provider: day, week, month, year or agenda, the
 * number of days, and the weekend, declined event and week number settings
 */
export function CalendarViewSwitcher() {
  const {
    view,
    numberOfDays,
    viewSettings,
    switchView,
    setNumberOfDays,
    toggleWeekends,
    toggleDeclinedEvents,
    toggleWeekNumbers,
  } = useCalendar();

  return (
    <ViewDropdown
      view={view}
      numberOfDays={numberOfDays}
      viewSettings={viewSettings}
      onSwitchView={switchView}
      onSetNumberOfDays={setNumberOfDays}
      onToggleWeekends={toggleWeekends}
      onToggleDeclinedEvents={toggleDeclinedEvents}
      onToggleWeekNumbers={toggleWeekNumbers}
    />
  );
}

interface CalendarNavigationProps {
  /** Classes for the previous and next buttons, e.g. their size */
  buttonClassName?: string;
}

/** Today, then previous and next, labelled with the period they move by */
export function CalendarNavigation({
  buttonClassName,
}: CalendarNavigationProps) {
  const { view, goToToday, goToPrev, goToNext } = useCalendar();
  const label = periodLabel(view);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="px-2 @md/header:px-3"
        onClick={goToToday}
      >
        {t("nav.today")}
      </Button>
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className={cn("text-muted-foreground", buttonClassName)}
          onClick={goToPrev}
        >
          <ChevronLeftIcon className="size-4" />
          <span className="sr-only">{t("nav.previous", { period: label })}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("text-muted-foreground", buttonClassName)}
          onClick={goToNext}
        >
          <ChevronRightIcon className="size-4" />
          <span className="sr-only">{t("nav.next", { period: label })}</span>
        </Button>
      </div>
    </>
  );
}
