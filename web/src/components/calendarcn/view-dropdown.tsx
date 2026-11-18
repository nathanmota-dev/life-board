"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/components/calendarcn/lib/utils";
import { Button } from "@/components/calendarcn/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/calendarcn/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@/components/calendarcn/ui/kbd";
import { NUMBER_OF_DAYS_OPTIONS } from "@/components/calendarcn/lib/event-utils";
import { MOD_KEY_LABEL, t } from "@/components/calendarcn/lib/translate";

import type { ViewSettings, ViewType } from "@/components/calendarcn/week-view-types";

/** Display label for a view type */
export function viewLabel(view: ViewType): string {
  return t(`views.${view}`);
}

/** View mode options with their shortcut keys */
const VIEW_OPTIONS: Array<{
  value: ViewType;
  shortcuts: Array<string>;
}> = [
  { value: "day", shortcuts: ["1", "or", "D"] },
  { value: "week", shortcuts: ["0", "or", "W"] },
  { value: "month", shortcuts: ["M"] },
  { value: "year", shortcuts: ["Y"] },
  { value: "agenda", shortcuts: ["A"] },
];

/**
 * Shortcut hints inside menu items drop the key-cap background. Classes
 * rather than a Kbd variant, so the file works with the stock shadcn/ui Kbd.
 */
const PLAIN_KBD_CLASS = "h-auto min-w-0 rounded-none bg-transparent px-0";

interface ViewDropdownProps {
  view: ViewType;
  numberOfDays: number;
  viewSettings: ViewSettings;
  onSwitchView: (view: ViewType) => void;
  onSetNumberOfDays: (count: number) => void;
  onToggleWeekends: () => void;
  onToggleDeclinedEvents: () => void;
  onToggleWeekNumbers: () => void;
}

export function ViewDropdown({
  view,
  numberOfDays,
  viewSettings,
  onSwitchView,
  onSetNumberOfDays,
  onToggleWeekends,
  onToggleWeekNumbers,
}: ViewDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-1 px-3">
          {viewLabel(view)}
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-56">
        {VIEW_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onSwitchView(option.value)}
          >
            <CheckIcon
              className={cn(
                "size-4 shrink-0",
                view !== option.value && "invisible",
              )}
            />
            {viewLabel(option.value)}
            <KbdGroup className="ml-auto">
              {option.shortcuts.map((s) =>
                s === "or" ? (
                  <span key={s} className="text-muted-foreground text-xs">
                    {t("view.or")}
                  </span>
                ) : (
                  <Kbd key={s} className={PLAIN_KBD_CLASS}>
                    {s}
                  </Kbd>
                ),
              )}
            </KbdGroup>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* Number of days submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="pl-8">
            {t("view.numberOfDays")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {NUMBER_OF_DAYS_OPTIONS.map((n) => (
              <DropdownMenuItem key={n} onClick={() => onSetNumberOfDays(n)}>
                <CheckIcon
                  className={cn(
                    "size-4 shrink-0",
                    numberOfDays !== n && "invisible",
                  )}
                />
                {t("view.days", { count: n })}
                <Kbd className={cn(PLAIN_KBD_CLASS, "ml-auto")}>{n}</Kbd>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* View settings submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="pl-8">
            {t("view.settings")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {/* Life Board: no participants, so no "Declined events" toggle */}
            <DropdownMenuCheckboxItem
              checked={viewSettings.showWeekends}
              onCheckedChange={() => onToggleWeekends()}
            >
              {t("view.weekends")}
              <KbdGroup className="ml-auto">
                <Kbd className={PLAIN_KBD_CLASS}>shift</Kbd>
                <Kbd className={PLAIN_KBD_CLASS}>{MOD_KEY_LABEL}</Kbd>
                <Kbd className={PLAIN_KBD_CLASS}>E</Kbd>
              </KbdGroup>
            </DropdownMenuCheckboxItem>

            <DropdownMenuCheckboxItem
              checked={viewSettings.showWeekNumbers}
              onCheckedChange={() => onToggleWeekNumbers()}
            >
              {t("view.weekNumbers")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
