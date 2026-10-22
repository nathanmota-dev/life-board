import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { updateFilesSettingsBody } from "../dto/settings.dto"

export const settingsController: FastifyPluginAsyncZod = async (app) => {
  const { filesSettings } = app.services

  app.get("/settings/files", () => filesSettings.get())

  app.put("/settings/files", { schema: { body: updateFilesSettingsBody } }, (request) =>
    filesSettings.update(request.body.baseDir),
  )
}
