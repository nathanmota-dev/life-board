import { startServer } from "../../api/src/server"

const dataDir = process.env.LIFE_BOARD_DATA_DIR
const migrationsFolder = process.env.LIFE_BOARD_MIGRATIONS_DIR

if (!dataDir || !migrationsFolder) {
  console.error("[backend] LIFE_BOARD_DATA_DIR e LIFE_BOARD_MIGRATIONS_DIR são obrigatórios.")
  process.exit(1)
}

let started = false

// The main process owns the encryption key and sends it once after forking.
const start = (secretKey: Buffer) => {
  if (started) return
  started = true
  startServer({ dataDir, migrationsFolder, secretKey })
    .then(({ url }) => {
      console.log(`[backend] API ouvindo em ${url}`)
      process.parentPort.postMessage({ type: "ready", url })
    })
    .catch((error: unknown) => {
      console.error("[backend] Não foi possível iniciar a API:", error)
      process.exit(1)
    })
}

process.parentPort.on("message", ({ data }) => {
  if (data === "ping") {
    process.parentPort.postMessage("pong")
  }
  if (data?.type === "secret-key" && typeof data.key === "string") start(Buffer.from(data.key, "base64"))
})
