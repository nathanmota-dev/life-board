import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A stand-in keyring: ciphertexts only decrypt while their "OS key" is the current one.
const keyring = vi.hoisted(() => ({ generation: 1, available: true, backend: "gnome_libsecret" }))

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => keyring.available,
    getSelectedStorageBackend: () => keyring.backend,
    encryptString: (text: string) => Buffer.from(`${keyring.generation}:${text}`),
    decryptString: (data: Buffer) => {
      const [generation, text] = data.toString().split(":")
      if (Number(generation) !== keyring.generation) throw new Error("Error while decrypting the ciphertext provided to safeStorage.decryptString.")
      return text
    },
  },
}))

const { confirmSecretsReset, loadSecretKey, resetSecretKey, UnreadableSecretKeyError } = await import("./secret-key")

const platform = process.platform
let dataDir: string
const file = (name: string) => join(dataDir, name)

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value })
}

beforeEach(() => {
  dataDir = join(mkdtempSync(join(tmpdir(), "life-board-key-")), "Usuário Ç")
  Object.assign(keyring, { generation: 1, available: true, backend: "gnome_libsecret" })
  setPlatform("linux")
})
afterEach(() => {
  setPlatform(platform)
  rmSync(join(dataDir, ".."), { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe("loadSecretKey", () => {
  it("creates a 32-byte key on first run and asks to reset secrets once", () => {
    const first = loadSecretKey(dataDir)
    expect(first.key).toHaveLength(32)
    expect(first.resetSecrets).toBe(true)
    expect(existsSync(file("secret.key.enc.tmp"))).toBe(false)
    expect(existsSync(file("secret.key.pending"))).toBe(false)

    confirmSecretsReset(dataDir)
    const second = loadSecretKey(dataDir)
    expect(second).toEqual({ key: first.key, resetSecrets: false })
  })

  it("keeps asking to reset secrets until the backend confirms it", () => {
    const { key } = loadSecretKey(dataDir)
    expect(loadSecretKey(dataDir)).toEqual({ key, resetSecrets: true })
  })

  it("loads an existing key without touching the file", () => {
    const { key } = loadSecretKey(dataDir)
    confirmSecretsReset(dataDir)
    const saved = readFileSync(file("secret.key.enc"))
    expect(loadSecretKey(dataDir).key).toEqual(key)
    expect(readFileSync(file("secret.key.enc"))).toEqual(saved)
  })

  it("refuses to start without a usable keyring", () => {
    keyring.available = false
    expect(() => loadSecretKey(dataDir)).toThrow("O chaveiro do sistema não está disponível")
    keyring.available = true
    keyring.backend = "basic_text"
    expect(() => loadSecretKey(dataDir)).toThrow("Nenhum chaveiro do sistema encontrado")
    expect(existsSync(file("secret.key.enc"))).toBe(false)
  })

  it.each(["linux", "darwin", "win32"] as const)("reports a confirmed key the keyring can't decrypt (%s)", (os) => {
    setPlatform(os)
    loadSecretKey(dataDir)
    confirmSecretsReset(dataDir)
    loadSecretKey(dataDir)
    const saved = readFileSync(file("secret.key.enc"))
    keyring.generation = 2

    expect(() => loadSecretKey(dataDir)).toThrow(UnreadableSecretKeyError)
    expect(readFileSync(file("secret.key.enc"))).toEqual(saved)
  })

  it("rejects a key with the wrong length as unreadable", () => {
    loadSecretKey(dataDir)
    writeFileSync(file("secret.key.enc"), `1:${Buffer.alloc(16).toString("base64")}`)
    expect(() => loadSecretKey(dataDir)).toThrow(UnreadableSecretKeyError)
  })

  it("on Windows, keeps a new key pending until a later start decrypts it", () => {
    setPlatform("win32")
    const { key } = loadSecretKey(dataDir)
    expect(existsSync(file("secret.key.pending"))).toBe(true)
    expect(loadSecretKey(dataDir).key).toEqual(key)
    expect(existsSync(file("secret.key.pending"))).toBe(false)
  })

  it("on Windows, replaces a pending key that the keyring lost after a forced exit", () => {
    setPlatform("win32")
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const first = loadSecretKey(dataDir)
    confirmSecretsReset(dataDir)
    // Chromium never saved its key, so the next start gets a new one.
    keyring.generation = 2

    const second = loadSecretKey(dataDir)
    expect(second.resetSecrets).toBe(true)
    expect(second.key).not.toEqual(first.key)
    expect(console.warn).toHaveBeenCalledOnce()
    // Still pending: this start's keyring key may not be saved either.
    expect(existsSync(file("secret.key.pending"))).toBe(true)
    confirmSecretsReset(dataDir)
    expect(loadSecretKey(dataDir)).toEqual({ key: second.key, resetSecrets: false })
    expect(existsSync(file("secret.key.pending"))).toBe(false)
  })
})

describe("resetSecretKey", () => {
  it("replaces an unreadable key and keeps other files in the profile", () => {
    loadSecretKey(dataDir)
    confirmSecretsReset(dataDir)
    writeFileSync(file("life-board.db"), "data")
    keyring.generation = 2

    const key = resetSecretKey(dataDir)
    expect(loadSecretKey(dataDir)).toEqual({ key, resetSecrets: true })
    expect(readFileSync(file("life-board.db"), "utf8")).toBe("data")
  })
})
