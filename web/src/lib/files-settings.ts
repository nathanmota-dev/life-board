// Mirrors the API: uploads and pages go in subfolders so they never mix with the user's own files.
const UPLOADS_SUBDIR = ["life-board-app", "uploads"]
const PAGES_SUBDIR = ["life-board-app", "pages"]

/** Where uploads land for a picked folder, using the folder's own separator. */
export function uploadsDirFor(baseDir: string) {
  return subdirFor(baseDir, UPLOADS_SUBDIR)
}

/** Where pages land for a picked folder, next to the uploads. */
export function pagesDirFor(baseDir: string) {
  return subdirFor(baseDir, PAGES_SUBDIR)
}

function subdirFor(baseDir: string, subdir: string[]) {
  const separator = baseDir.includes("\\") && !baseDir.includes("/") ? "\\" : "/"
  const base = baseDir.length > 1 ? baseDir.replace(/[\\/]+$/, "") : baseDir
  return [base === separator ? "" : base, ...subdir].join(separator)
}
