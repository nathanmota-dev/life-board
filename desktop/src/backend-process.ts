import { startServer } from "../../api/src/server"

process.parentPort.on("message", ({ data }) => {
  if (data === "ping") {
    process.parentPort.postMessage("pong")
  }
})

const dataDir = process.env.LIFE_BOARD_DATA_DIR
const migrationsFolder = process.env.LIFE_BOARD_MIGRATIONS_DIR

if (!dataDir || !migrationsFolder) {
  console.error("[backend] LIFE_BOARD_DATA_DIR e LIFE_BOARD_MIGRATIONS_DIR são obrigatórios.")
  process.exit(1)
}

startServer({ dataDir, migrationsFolder })
  .then(({ url }) => {
    console.log(`[backend] API ouvindo em ${url}`)
    process.parentPort.postMessage({ type: "ready", url })
  })
  .catch((error: unknown) => {
    console.error("[backend] Não foi possível iniciar a API:", error)
    process.exit(1)
  })
