import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ fromWebContents: vi.fn(), showOpenDialog: vi.fn(), handle: vi.fn() }))

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  dialog: { showOpenDialog: mocks.showOpenDialog },
  ipcMain: { handle: mocks.handle },
}))

import { pickDirectory, registerDirectoryPicker } from "./directory-picker"

const sender = {} as Electron.WebContents
const options = { properties: ["openDirectory", "createDirectory"] }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("directory picker", () => {
  it("returns the folder picked over the sender's window", async () => {
    const window = {}
    mocks.fromWebContents.mockReturnValue(window)
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/mnt/linux-data/apps"] })

    expect(await pickDirectory(sender)).toBe("/mnt/linux-data/apps")
    expect(mocks.showOpenDialog).toHaveBeenCalledWith(window, options)
  })

  it("returns null when cancelled, even without a window", async () => {
    mocks.fromWebContents.mockReturnValue(null)
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    expect(await pickDirectory(sender)).toBeNull()
    expect(mocks.showOpenDialog).toHaveBeenCalledWith(options)
  })

  it("answers the renderer's pick-directory requests", async () => {
    mocks.fromWebContents.mockReturnValue(null)
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
    registerDirectoryPicker()

    const [channel, handler] = mocks.handle.mock.calls[0]
    expect(channel).toBe("app:pick-directory")
    expect(await handler({ sender })).toBeNull()
  })
})
