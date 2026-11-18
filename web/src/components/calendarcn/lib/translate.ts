import { i18n } from "@/lib/i18n";

/** `i18n.t` without the typed keys: the calendar builds its keys at runtime */
const translate = i18n.t.bind(i18n) as unknown as (
  key: string,
  options: Record<string, unknown>,
) => string;

/**
 * Life Board: the calendar's UI text, read from the app's dictionaries under
 * `calendarcn.*`. The calendar mounts only on /calendar and the language
 * changes in Settings, so reading at render time is enough. A test checks
 * that each key exists in both dictionaries.
 */
export function t(key: string, options: Record<string, unknown> = {}): string {
  return translate(`calendarcn.${key}`, options);
}

/** Whether the app runs on macOS, where shortcuts use ⌘ instead of Ctrl */
export const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

/** The command key as a shortcut label shows it: "⌘" on macOS, "Ctrl" elsewhere */
export const MOD_KEY_LABEL = IS_MAC ? "⌘" : "Ctrl";

/** A modifier shortcut's label: "⌘X" on macOS, "Ctrl+X" elsewhere */
export function modShortcut(key: string): string {
  return IS_MAC ? `⌘${key}` : `Ctrl+${key}`;
}
