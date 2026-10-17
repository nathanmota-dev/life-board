import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CryptoService } from "./crypto.service"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "life-board-crypto-"))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe("CryptoService", () => {
  it("round-trips secrets with a fresh IV each time", () => {
    const crypto = new CryptoService(Buffer.alloc(32, 1))
    const first = crypto.seal("ghp_secret")
    const second = crypto.seal("ghp_secret")

    expect(first.iv).not.toBe(second.iv)
    expect(crypto.open(first)).toBe("ghp_secret")
  })

  it("rejects tampered data and malformed envelopes", () => {
    const crypto = new CryptoService(Buffer.alloc(32, 1))
    const sealed = crypto.seal("ghp_secret")
    const flipped = Buffer.from(sealed.ciphertext, "base64")
    flipped[0] ^= 1

    expect(() => crypto.open({ ...sealed, ciphertext: flipped.toString("base64") })).toThrow()
    expect(() => crypto.open({ ...sealed, iv: "AAAA" })).toThrow("Invalid IV length.")
    expect(() => crypto.open({ ...sealed, tag: "AAAA" })).toThrow("Invalid auth tag length.")
    expect(() => new CryptoService(Buffer.alloc(31, 1)).open(sealed)).toThrow("32 bytes")
    expect(() => new CryptoService(Buffer.alloc(32, 2)).open(sealed)).toThrow()
  })

  it("accepts base64, hex or any other env key consistently", () => {
    const key = Buffer.alloc(32, 9)
    const sealed = new CryptoService(key).seal("value")

    expect(CryptoService.fromEnvOrFile(dir, key.toString("base64")).open(sealed)).toBe("value")
    expect(CryptoService.fromEnvOrFile(dir, key.toString("hex")).open(sealed)).toBe("value")

    const fromPhrase = CryptoService.fromEnvOrFile(dir, "correct horse battery staple")
    const phraseSealed = fromPhrase.seal("value")
    expect(CryptoService.fromEnvOrFile(dir, "correct horse battery staple").open(phraseSealed)).toBe("value")
  })

  it("generates a private key file once and reuses it", async () => {
    const keyDir = join(dir, "nested")
    const sealed = CryptoService.fromEnvOrFile(keyDir, "").seal("value")
    const keyPath = join(keyDir, "secret.key")

    expect((await stat(keyPath)).mode & 0o777).toBe(0o600)
    expect(Buffer.from(await readFile(keyPath, "utf8"), "base64")).toHaveLength(32)
    expect(CryptoService.fromEnvOrFile(keyDir, "").open(sealed)).toBe("value")
  })
})
