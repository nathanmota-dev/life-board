"use client";

import { ExternalLink } from "lucide-react";
import { openExternal } from "@/lib/external";
import type { DetailedCalendarEvent } from "./week-view-types";
import {
  EVENT_DETAIL_ROW_HEIGHT_CLASS,
  EVENT_DETAIL_SECONDARY_CLASS,
  EventDetailDivider,
  EventDetailGroup,
} from "./event-detail-parts";
import { cn } from "@/components/calendarcn/lib/utils";

/**
 * Life Board: where a Google event comes from, with a link that opens it there,
 * and what to know about syncing it (not sent yet, one occurrence only). Shows
 * nothing for an event without `externalLink`, `unsyncedLabel` or `detailHint`.
 */
export function EventDetailExternalLink({
  event,
}: {
  event: DetailedCalendarEvent;
}) {
  const link = event.externalLink;
  const notes = [event.unsyncedLabel, event.detailHint].filter(Boolean);
  if (!link && notes.length === 0) return null;
  return (
    <>
      <EventDetailDivider />
      <EventDetailGroup name="source">
        {link ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-[7px] text-xs",
            EVENT_DETAIL_ROW_HEIGHT_CLASS,
          )}
        >
          <span className={EVENT_DETAIL_SECONDARY_CLASS}>{link.label}</span>
          {link.url ? (
            <button
              type="button"
              data-testid="event-open-external"
              onClick={() => link.url && openExternal(link.url)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {link.openLabel}
              <ExternalLink className="size-3" aria-hidden />
            </button>
          ) : null}
        </div>
        ) : null}
        {event.unsyncedLabel ? (
          <p
            data-testid="event-not-synced"
            className={cn("px-[7px] text-xs", EVENT_DETAIL_SECONDARY_CLASS)}
          >
            {event.unsyncedLabel}
          </p>
        ) : null}
        {event.detailHint ? (
          <p
            data-testid="event-occurrence-hint"
            className={cn("px-[7px] pb-1 text-xs", EVENT_DETAIL_SECONDARY_CLASS)}
          >
            {event.detailHint}
          </p>
        ) : null}
      </EventDetailGroup>
    </>
  );
}
