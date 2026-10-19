import { nativeImage } from "electron"
import type { NativeImage } from "electron"

// Draws the tray's progress ring pixel by pixel, so it works with no window
// (and no canvas) around. Rendered at 2x and handed over as a HiDPI image.

const SIZE = 44
const SCALE = 2
const RING_WIDTH = 7

type Rgb = [number, number, number]

const clamp = (value: number) => Math.min(1, Math.max(0, value))

function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as Rgb
}

/** A ring filled clockwise from 12 o'clock up to `progress` (0–1); the rest is a faint track. */
export function ringIcon(progress: number, hex: string, dimmed = false): NativeImage {
  const [red, green, blue] = hexToRgb(hex)
  // Electron expects premultiplied BGRA.
  const pixels = Buffer.alloc(SIZE * SIZE * 4)
  const outer = SIZE / 2 - 1
  const inner = outer - RING_WIDTH

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x + 0.5 - SIZE / 2
      const dy = y + 0.5 - SIZE / 2
      const distance = Math.hypot(dx, dy)
      // Soft one-pixel edges on both sides of the ring.
      const coverage = clamp(outer - distance + 0.5) * clamp(distance - inner + 0.5)
      if (coverage === 0) continue

      const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI)
      const filled = angle / (2 * Math.PI) <= progress
      const alpha = coverage * (filled ? (dimmed ? 0.55 : 1) : 0.3)
      const offset = (y * SIZE + x) * 4
      pixels[offset] = Math.round(blue * alpha)
      pixels[offset + 1] = Math.round(green * alpha)
      pixels[offset + 2] = Math.round(red * alpha)
      pixels[offset + 3] = Math.round(255 * alpha)
    }
  }

  return nativeImage.createFromBitmap(pixels, { width: SIZE, height: SIZE, scaleFactor: SCALE })
}

/** The app icon at tray size for the current platform. */
export function appTrayIcon(iconPath: string) {
  const size = process.platform === "win32" ? 16 : 22
  return nativeImage.createFromPath(iconPath).resize({ width: size, height: size, quality: "best" })
}
