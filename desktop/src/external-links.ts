/**
 * Prefixes of the links that may leave the app through `app:open-external`:
 * GitHub (PRs, profiles), Google's OAuth consent page (the Google Calendar login
 * opens in the default browser) and the Google Cloud console (the setup how-to).
 * Each one ends at a path, so a look-alike host such as
 * `https://accounts.google.com.evil.example/` never matches.
 */
export const EXTERNAL_LINK_PREFIXES = [
  "https://github.com/",
  "https://accounts.google.com/o/oauth2/",
  "https://console.cloud.google.com/",
] as const

export function isAllowedExternalLink(url: unknown): url is string {
  return typeof url === "string" && EXTERNAL_LINK_PREFIXES.some((prefix) => url.startsWith(prefix))
}
