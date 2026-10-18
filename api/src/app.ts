import { join } from "node:path"
import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import Fastify, { type FastifyServerOptions } from "fastify"
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod"
import { calendarController } from "./controllers/calendar.controller"
import { fileBoardsController } from "./controllers/file-boards.controller"
import { githubController } from "./controllers/github.controller"
import { goalsController } from "./controllers/goals.controller"
import { habitsController } from "./controllers/habits.controller"
import { healthController } from "./controllers/health.controller"
import { linksController } from "./controllers/links.controller"
import { moodController } from "./controllers/mood.controller"
import { statsController } from "./controllers/stats.controller"
import { tasksController } from "./controllers/tasks.controller"
import { thoughtsController } from "./controllers/thoughts.controller"
import type { Db } from "./db/client"
import { MAX_UPLOAD_BYTES } from "./dto/file-boards.dto"
import { registerAuth, registerProtected, type Authenticate } from "./plugins/auth"
import { registerErrorHandler } from "./plugins/error-handler"
import { CalendarService } from "./services/calendar.service"
import type { CryptoService } from "./services/crypto.service"
import { FileBoardsService } from "./services/file-boards.service"
import { FileStorageService } from "./services/file-storage.service"
import { GithubClient } from "./services/github-client.service"
import { GithubService } from "./services/github.service"
import { GoalsService } from "./services/goals.service"
import { HabitsService } from "./services/habits.service"
import { LinksService } from "./services/links.service"
import { MoodService } from "./services/mood.service"
import { StatsService } from "./services/stats.service"
import { TasksService } from "./services/tasks.service"
import { ThoughtsService } from "./services/thoughts.service"

// The renderer origin in dev, and `null` for the packaged app loaded from file://.
const ALLOWED_ORIGINS = ["http://127.0.0.1:5180", "http://localhost:5180", "null"]

export type AppOptions = {
  db: Db
  dataDir: string
  logger?: FastifyServerOptions["logger"]
  githubClient?: GithubClient
  crypto: CryptoService
  authenticate?: Authenticate
}

export async function buildApp({ db, dataDir, logger = false, githubClient, crypto, authenticate }: AppOptions) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registerErrorHandler(app)
  registerAuth(app, authenticate)

  await app.register(cors, { origin: ALLOWED_ORIGINS, credentials: true })
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } })

  app.decorate("services", {
    tasks: new TasksService(db),
    thoughts: new ThoughtsService(db),
    links: new LinksService(db),
    goals: new GoalsService(db),
    calendar: new CalendarService(db),
    mood: new MoodService(db),
    habits: new HabitsService(db),
    stats: new StatsService(db),
    github: new GithubService(
      db,
      githubClient ?? new GithubClient(),
      crypto,
      app.log,
    ),
    fileBoards: new FileBoardsService(db, new FileStorageService(join(dataDir, "uploads"))),
  })

  // Public routes.
  await app.register(healthController, { prefix: "/api" })

  // Everything else goes through `app.authenticate` (a no-op until auth exists).
  await registerProtected(app, async (scope) => {
    for (const controller of [
      tasksController,
      thoughtsController,
      linksController,
      goalsController,
      calendarController,
      moodController,
      habitsController,
      statsController,
      githubController,
      fileBoardsController,
    ]) {
      await scope.register(controller, { prefix: "/api" })
    }
  })

  return app
}

export type Services = {
  tasks: TasksService
  thoughts: ThoughtsService
  links: LinksService
  goals: GoalsService
  calendar: CalendarService
  mood: MoodService
  habits: HabitsService
  stats: StatsService
  github: GithubService
  fileBoards: FileBoardsService
}

declare module "fastify" {
  interface FastifyInstance {
    services: Services
  }
}
