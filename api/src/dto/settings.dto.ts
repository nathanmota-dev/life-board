import { z } from "zod"

// `null` moves uploads back to the data directory.
export const updateFilesSettingsBody = z.object({ baseDir: z.string().trim().min(1).max(1024).nullable() })
