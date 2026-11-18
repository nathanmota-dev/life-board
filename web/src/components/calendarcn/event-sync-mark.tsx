"use client";

import { CloudUpload } from "lucide-react";
import type { DetailedCalendarEvent } from "./week-view-types";

/**
 * Life Board: the small mark before the title of an event whose change hasn't
 * reached Google yet. Draws nothing once it is synced.
 */
export function EventSyncMark({ event }: { event: DetailedCalendarEvent }) {
  if (!event.unsyncedLabel) return null;
  return (
    <span
      role="img"
      aria-label={event.unsyncedLabel}
      title={event.unsyncedLabel}
      data-testid="event-sync-mark"
      className="mr-1 inline-block align-middle opacity-70"
    >
      <CloudUpload className="size-2.5" aria-hidden />
    </span>
  );
}
