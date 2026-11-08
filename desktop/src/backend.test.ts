import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const spawn = vi.hoisted(() => vi.fn())
vi.mock("node:child_process", () => ({ spawn }))

import { backendBinaryPath, BACKEND_READY_TIMEOUT_MS, startBackend } from "./backend"

class FakeChild extends EventEmitter {
  stdin = Object.assign(new PassThrough(), { written: "" })
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill = vi.fn(() => true)
  constructor() {
    super()
    this.stdin.on("data", (chunk: Buffer) => { this.stdin.written += chunk.toString() })
  }
}

const key = Buffer.alloc(32, 7)
const options = { isPackaged: true, appPath: "/app", resourcesPath: "/res", platform: "linux" as const, dataDir: "/data", key, resetSecrets: false }
const tick = () => new Promise((resolve) => setImmediate(resolve))
let child: FakeChild

beforeEach(() => {
  child = new FakeChild()
  spawn.mockReset().mockReturnValue(child)
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("backendBinaryPath", () => {
  it.each([
    [true, "linux", "/res/bin/life-board-api"],
    [true, "win32", "/res/bin/life-board-api.exe"],
    [false, "darwin", "/app/target/debug/life-board-api"],
    [false, "win32", "/app/target/debug/life-board-api.exe"],
  ] as const)("packaged=%s on %s runs %s", (isPackaged, platform, expected) => {
    expect(backendBinaryPath({ isPackaged, platform, appPath: "/app", resourcesPath: "/res" }).replaceAll("\\", "/")).toBe(expected)
  })
})

describe("startBackend", () => {
  it("spawns the binary with the data folder and sends the key only on stdin", async () => {
    startBackend({ ...options, resetSecrets: true })
    await tick()
    const [file, args, spawned] = spawn.mock.calls[0]
    expect(file.replaceAll("\\", "/")).toBe("/res/bin/life-board-api")
    expect(args).toEqual([])
    expect(spawned.env.LIFE_BOARD_DATA_DIR).toBe("/data")
    expect(spawned.windowsHide).toBe(true)
    expect(JSON.stringify([args, spawned.env])).not.toContain(key.toString("base64"))
    expect(child.stdin.written).toBe(`{"type":"secret-key","key":"${key.toString("base64")}","resetSecrets":true}\n`)
    expect(child.stdin.writableEnded).toBe(false)
  })

  it("resolves on the ready line, ignoring anything else on stdout", async () => {
    const { url } = startBackend(options)
    child.stdout.write("not json\n")
    child.stdout.write('{"type":"other","url":"http://wrong"}\n')
    child.stdout.write('{"type":"ready","url":"http://127.0.0.1:')
    child.stdout.write('4321"}\n')
    await expect(url).resolves.toBe("http://127.0.0.1:4321")
    expect(console.log).toHaveBeenCalledWith("[backend] API ouvindo em http://127.0.0.1:4321")
  })

  it("rejects and logs when the process exits before it is ready", async () => {
    const { url } = startBackend(options)
    child.emit("exit", 3)
    await expect(url).rejects.toThrow("encerrou antes de ficar pronto")
    expect(console.error).toHaveBeenCalledWith("O backend encerrou com código 3.")
  })

  it("rejects when the binary cannot be started", async () => {
    const { url } = startBackend(options)
    child.emit("error", new Error("spawn ENOENT"))
    await expect(url).rejects.toThrow("ENOENT")
  })

  it("survives a closed stdin from a process that died early", () => {
    startBackend(options)
    expect(() => child.stdin.emit("error", new Error("EPIPE"))).not.toThrow()
  })

  it("kills the process and rejects after the timeout", async () => {
    vi.useFakeTimers()
    const { url } = startBackend(options)
    const settled = expect(url).rejects.toThrow("não ficou pronto a tempo")
    await vi.advanceTimersByTimeAsync(BACKEND_READY_TIMEOUT_MS - 1)
    expect(child.kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await settled
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it("does not time out once ready", async () => {
    vi.useFakeTimers()
    const { url } = startBackend(options)
    child.stdout.write('{"type":"ready","url":"http://127.0.0.1:1"}\n')
    vi.useRealTimers()
    await url
    await tick()
    expect(child.kill).not.toHaveBeenCalled()
  })

  it("forwards stderr to the main-process log", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    startBackend(options)
    child.stderr.write("sidecar log\n")
    await tick()
    expect(write.mock.calls.map(([chunk]) => String(chunk))).toContain("sidecar log\n")
  })

  it("stop kills the process", () => {
    startBackend(options).stop()
    expect(child.kill).toHaveBeenCalledOnce()
  })
})
