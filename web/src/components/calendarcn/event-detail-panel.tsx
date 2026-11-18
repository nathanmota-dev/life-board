"use client";

import * as React from "react";
import {
  Check,
  Copy,
  MoreHorizontal,
  SquareDashed,
  TabletSmartphone,
  Trash2,
} from "lucide-react";

import { cn } from "@/components/calendarcn/lib/utils";
import { useInlineEdit } from "@/components/calendarcn/hooks/use-inline-edit";
import { Button } from "@/components/calendarcn/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/calendarcn/ui/dropdown-menu";
import { EVENT_COLORS, resolveEventColor } from "@/components/calendarcn/lib/event-utils";
import { t } from "@/components/calendarcn/lib/translate";
import { useCalendarConfig } from "./calendar-provider";
import { EVENT_COLOR_SWATCH_CLASS } from "./event-context-menu";
import { EventDetailDescription } from "./event-detail-description";
import { EventDetailLocation } from "./event-detail-location";
import {
  EVENT_ACTION_KEYS,
  EVENT_DETAIL_ICON_BUTTON_CLASS,
  EVENT_DETAIL_INPUT_CLASS,
  EVENT_DETAIL_MENU_CLASS,
  EVENT_DETAIL_MENU_ITEM_CLASS,
  EVENT_DETAIL_ROW_HEIGHT_CLASS,
  EVENT_DETAIL_SECONDARY_CLASS,
  EVENT_DETAIL_TEXT_CLASS,
  EventDetailDivider,
  EventDetailGroup,
  stopEscapePropagation,
} from "./event-detail-parts";
import { EventDetailAllDay, EventDetailTime } from "./event-detail-time";
import type { DetailedCalendarEvent } from "./week-view-types";

/**
 * Props for EventDetailPanel. `TEvent` is the app's event type; detail fields
 * it doesn't set show placeholders, and edits keep its other fields.
 */
interface EventDetailPanelProps<
  TEvent extends DetailedCalendarEvent = DetailedCalendarEvent,
> {
  event: TEvent;
  onEventChange?: (event: TEvent) => void;
  /**
   * Shows the previous event of a repeating series (the repeat row's left
   * arrow). Leave it out at the series' start: the arrow is disabled then.
   */
  onPrevWeek?: () => void;
  /**
   * Shows the next event of a repeating series (the right arrow). Leave it
   * out at the series' end: the arrow is disabled then.
   */
  onNextWeek?: () => void;
  /** The "..." menu's Cut: keeps a copy for pasting and deletes the event. Disabled without it */
  onCut?: () => void;
  /** The "..." menu's Copy: keeps a copy of the event for pasting. Disabled without it */
  onCopy?: () => void;
  /** The "..." menu's Duplicate: adds a copy at the same time. Disabled without it */
  onDuplicate?: () => void;
  /** The "..." menu's Delete. Disabled without it */
  onDelete?: () => void;
  /** Extra action buttons rendered in the header row (after the "..." menu). */
  headerActions?: React.ReactNode;
  /** When true, focuses and selects the title input once (e.g. for a just-created event). */
  autoFocusTitle?: boolean;
  /** Called after the title input was auto-focused, so the request is not repeated. */
  onTitleAutoFocused?: () => void;
}

/**
 * Life Board: the event's color, as a row of swatches in the header where
 * Notion Calendar has the event kind menu
 */
function EventDetailColors<TEvent extends DetailedCalendarEvent>({
  event,
  onEventChange,
}: {
  event: TEvent;
  onEventChange?: (event: TEvent) => void;
}) {
  const { calendars } = useCalendarConfig();
  const current = resolveEventColor(event, calendars);

  return (
    <div className="flex items-center gap-1.5 px-[7px]" role="group" aria-label={t("details.color")}>
      {EVENT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          disabled={!onEventChange}
          aria-label={t(`colors.${color}`)}
          aria-pressed={color === current}
          className={cn(
            "relative flex size-3.5 items-center justify-center rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
            EVENT_COLOR_SWATCH_CLASS[color],
          )}
          onClick={() => onEventChange?.({ ...event, color })}
        >
          {color === current && <Check className="size-2.5 text-white" />}
        </button>
      ))}
    </div>
  );
}

/**
 * Notion Calendar-style event details, trimmed by Life Board to the fields
 * the app stores: color, title, time, all-day, location and description.
 * Each section edits its own fields through `onEventChange`.
 */
export function EventDetailPanel<
  TEvent extends DetailedCalendarEvent = DetailedCalendarEvent,
>({
  event,
  onEventChange,
  onCut,
  onCopy,
  onDuplicate,
  onDelete,
  headerActions,
  autoFocusTitle,
  onTitleAutoFocused,
}: EventDetailPanelProps<TEvent>) {
  const titleRef = React.useRef<HTMLInputElement>(null);
  const title = useInlineEdit({
    inputRef: titleRef,
    value: event.title,
    onInput: (text) => onEventChange?.({ ...event, title: text }),
    onRestore: (text) => onEventChange?.({ ...event, title: text }),
    onCommit: (text) => {
      const trimmed = text.trim();
      // Only spaces: back to the title from before editing. Deleting the
      // whole title still clears it.
      if (text && !trimmed) return null;
      if (trimmed !== text) onEventChange?.({ ...event, title: trimmed });
      return trimmed;
    },
  });

  // Focus + select the title on request so a new event can be named right away.
  // Deferred a frame so a popover host has been positioned before focusing.
  React.useEffect(() => {
    if (!autoFocusTitle) return;
    const frame = requestAnimationFrame(() => {
      titleRef.current?.focus({ preventScroll: true });
      titleRef.current?.select();
      onTitleAutoFocused?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocusTitle, onTitleAutoFocused, titleRef]);

  return (
    <div
      className={cn(
        "flex flex-col pt-3 text-sm font-medium",
        EVENT_DETAIL_TEXT_CLASS,
      )}
    >
      {/* Header: color, "..." menu and the host's actions */}
      <div
        className={cn(
          "flex items-center justify-between pr-3 pl-2",
          EVENT_DETAIL_ROW_HEIGHT_CLASS,
        )}
      >
        <EventDetailColors event={event} onEventChange={onEventChange} />
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("details.moreActions")}
                className={cn(
                  "size-7",
                  EVENT_DETAIL_ICON_BUTTON_CLASS,
                  EVENT_DETAIL_SECONDARY_CLASS,
                )}
              >
                <MoreHorizontal className="size-[18px]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="left"
              className={cn("min-w-[180px]", EVENT_DETAIL_MENU_CLASS)}
              onKeyDown={stopEscapePropagation}
            >
              <DropdownMenuItem
                disabled={!onCut}
                aria-keyshortcuts={EVENT_ACTION_KEYS.cut.aria}
                className={EVENT_DETAIL_MENU_ITEM_CLASS}
                onClick={onCut}
              >
                <SquareDashed className="size-3.5" />
                {t("actions.cut")}
                <DropdownMenuShortcut aria-hidden className="text-white/40">
                  {EVENT_ACTION_KEYS.cut.label}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!onCopy}
                aria-keyshortcuts={EVENT_ACTION_KEYS.copy.aria}
                className={EVENT_DETAIL_MENU_ITEM_CLASS}
                onClick={onCopy}
              >
                <TabletSmartphone className="size-3.5" />
                {t("actions.copy")}
                <DropdownMenuShortcut aria-hidden className="text-white/40">
                  {EVENT_ACTION_KEYS.copy.label}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!onDuplicate}
                aria-keyshortcuts={EVENT_ACTION_KEYS.duplicate.aria}
                className={EVENT_DETAIL_MENU_ITEM_CLASS}
                onClick={onDuplicate}
              >
                <Copy className="size-3.5" />
                {t("actions.duplicate")}
                <DropdownMenuShortcut aria-hidden className="text-white/40">
                  {EVENT_ACTION_KEYS.duplicate.label}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#303030]" />
              <DropdownMenuItem
                disabled={!onDelete}
                aria-keyshortcuts={EVENT_ACTION_KEYS.delete.aria}
                className="text-xs text-[#E56458] focus:!bg-[#DE5551] focus:!text-white focus:[&>svg]:!text-white focus:[&>[data-slot=dropdown-menu-shortcut]]:!text-white"
                onClick={onDelete}
              >
                <Trash2 className="size-3.5 text-[#E56458]" />
                {t("actions.delete")}
                <DropdownMenuShortcut
                  aria-hidden
                  className="text-white/40 tracking-normal"
                >
                  {EVENT_ACTION_KEYS.delete.label}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {headerActions}
        </div>
      </div>

      {/* Title */}
      <div className="mt-1.5 flex flex-col px-2 pb-2">
        <input
          ref={titleRef}
          {...title.inputProps}
          type="text"
          placeholder={t("details.title")}
          aria-label={t("details.title")}
          readOnly={!onEventChange}
          className={cn(
            "h-[35px] px-[7px] placeholder:text-[#ABABA9] dark:placeholder:text-[#595959]",
            EVENT_DETAIL_INPUT_CLASS,
          )}
        />
      </div>

      <EventDetailDivider />

      {/* When: time and date, then all-day */}
      <EventDetailGroup name="when">
        <EventDetailTime event={event} onEventChange={onEventChange} />
        <div
          className={cn(
            "flex flex-col justify-center",
            EVENT_DETAIL_ROW_HEIGHT_CLASS,
          )}
        >
          <EventDetailAllDay event={event} onEventChange={onEventChange} />
        </div>
      </EventDetailGroup>

      <EventDetailDivider />

      <EventDetailGroup name="where">
        <EventDetailLocation event={event} onEventChange={onEventChange} />
      </EventDetailGroup>

      <EventDetailDivider />

      {/* At least one 35px row, empty or not */}
      <EventDetailGroup name="description" className="min-h-[51px]">
        <EventDetailDescription event={event} onEventChange={onEventChange} />
      </EventDetailGroup>
    </div>
  );
}
