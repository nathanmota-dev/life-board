import { describe, expect, it } from "vitest"
import { CryptoService } from "./crypto.service"

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

})
