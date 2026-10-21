import { api } from "@/services/api-client"
import type { FilesSettings } from "@/types/settings"

export const settingsService = {
  files: () => api.get<FilesSettings>("/settings/files"),
  // Moves every upload to the new folder; `null` goes back to the default one.
  updateFiles: (baseDir: string | null) => api.put<FilesSettings>("/settings/files", { baseDir }),
}
