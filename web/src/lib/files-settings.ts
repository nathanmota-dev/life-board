// Mirrors the API: uploads go in a subfolder so they never mix with the user's own files.
const UPLOADS_SUBDIR = ["life-board-app", "uploads"]

/** Where uploads land for a picked folder, using the folder's own separator. */
export function uploadsDirFor(baseDir: string) {
  const separator = baseDir.includes("\\") && !baseDir.includes("/") ? "\\" : "/"
  const base = baseDir.length > 1 ? baseDir.replace(/[\\/]+$/, "") : baseDir
  return [base === separator ? "" : base, ...UPLOADS_SUBDIR].join(separator)
}
