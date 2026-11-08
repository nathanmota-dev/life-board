import { spawn } from "node:child_process"
import { join } from "node:path"
import { createInterface } from "node:readline"

/** Migrations run before the API listens, so a large profile needs room. */
export const BACKEND_READY_TIMEOUT_MS = 60_000

export type BackendLocation = { isPackaged: boolean; appPath: string; resourcesPath: string; platform: NodeJS.Platform }

export type BackendOptions = BackendLocation & { dataDir: string; key: Buffer; resetSecrets: boolean; timeoutMs?: number }

export type Backend = { url: Promise<string>; stop: () => void }

/** The sidecar ships in `resources/bin`; in dev it comes from the Cargo build. */
export function backendBinaryPath({ isPackaged, appPath, resourcesPath, platform }: BackendLocation) {
  const name = platform === "win32" ? "life-board-api.exe" : "life-board-api"
  return isPackaged ? join(resourcesPath, "bin", name) : join(appPath, "target", "debug", name)
}

/** Starts the Rust API. `url` settles with the `ready` line, or rejects if the process fails first. */
export function startBackend({ dataDir, key, resetSecrets, timeoutMs = BACKEND_READY_TIMEOUT_MS, ...location }: BackendOptions): Backend {
  const child = spawn(backendBinaryPath(location), [], {
    env: { ...process.env, LIFE_BOARD_DATA_DIR: dataDir },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  // A sidecar that dies early closes the pipe; `exit` below reports that.
  child.stdin.on("error", () => {})
  // Stdin stays open: the sidecar exits when it closes, so it never outlives Electron.
  child.stdin.write(`${JSON.stringify({ type: "secret-key", key: key.toString("base64"), resetSecrets })}\n`)

  const url = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("O backend não ficou pronto a tempo."))
      child.kill()
    }, timeoutMs)
    createInterface({ input: child.stdout }).on("line", (line) => {
      const url = readyUrl(line)
      if (!url) return
      clearTimeout(timer)
      console.log(`[backend] API ouvindo em ${url}`)
      resolve(url)
    })
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once("exit", (code) => {
      clearTimeout(timer)
      if (code !== 0) console.error(`O backend encerrou com código ${code}.`)
      reject(new Error("O backend encerrou antes de ficar pronto."))
    })
  })
  return { url, stop: () => void child.kill() }
}

function readyUrl(line: string) {
  try {
    const message = JSON.parse(line) as { type?: string; url?: string }
    return message.type === "ready" ? message.url : undefined
  } catch {
    return undefined
  }
}
