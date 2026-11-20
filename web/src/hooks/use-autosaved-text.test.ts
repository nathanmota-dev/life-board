import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AUTOSAVE_DELAY_MS, useAutosavedText } from "@/hooks/use-autosaved-text"

function setup(save = vi.fn().mockResolvedValue(undefined), text = "hello") {
  const hook = renderHook((props: { text: string }) =>
    useAutosavedText({ text: props.text, save, savedMessage: "Saved!", alreadySavedMessage: "Nothing new" }),
    { initialProps: { text } },
  )
  return { ...hook, save }
}

describe("useAutosavedText", () => {
  it("starts clean with the text it was given", () => {
    const { result } = setup()
    expect(result.current).toMatchObject({ value: "hello", dirty: false })
  })

  it("becomes dirty on a change and clean again when the change is undone", () => {
    const { result } = setup()
    act(() => result.current.setValue("hello world"))
    expect(result.current).toMatchObject({ value: "hello world", dirty: true })

    act(() => result.current.setValue("hello"))
    expect(result.current.dirty).toBe(false)
  })

  it("saves by itself after a pause in typing, only once", async () => {
    vi.useFakeTimers()
    const { result, save } = setup()
    act(() => result.current.setValue("hello again"))
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100))
    expect(save).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(save).toHaveBeenCalledExactlyOnceWith("hello again")
    expect(result.current.dirty).toBe(false)
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2))
    expect(save).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("restarts the pause with each keystroke", async () => {
    vi.useFakeTimers()
    const { result, save } = setup()
    act(() => result.current.setValue("a"))
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100))
    act(() => result.current.setValue("ab"))
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100))
    expect(save).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(save).toHaveBeenCalledExactlyOnceWith("ab")
    vi.useRealTimers()
  })

  it("saves on demand, and says so when there is nothing to save", async () => {
    const { result, save } = setup()
    await act(() => result.current.saveNow())
    expect(save).not.toHaveBeenCalled()

    act(() => result.current.setValue("changed"))
    await act(() => result.current.saveNow())
    expect(save).toHaveBeenCalledExactlyOnceWith("changed")
    await waitFor(() => expect(result.current.dirty).toBe(false))
  })

  it("saves what the pause didn't reach when it unmounts", async () => {
    const { result, save, unmount } = setup()
    act(() => result.current.setValue("unsaved"))

    unmount()

    await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith("unsaved"))
  })

  it("keeps the text dirty when a save fails", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Disk unavailable"))
    const { result } = setup(save)
    act(() => result.current.setValue("changed"))

    await act(() => result.current.saveNow())

    expect(save).toHaveBeenCalledTimes(1)
    expect(result.current.dirty).toBe(true)
  })

  it("runs saves one at a time, in order", async () => {
    const order: string[] = []
    let release = () => {}
    const save = vi.fn(async (content: string) => {
      order.push(`start ${content}`)
      if (content === "first") await new Promise<void>((resolve) => (release = resolve))
      order.push(`end ${content}`)
    })
    const { result } = setup(save)
    act(() => result.current.setValue("first"))
    let firstSave: Promise<void> = Promise.resolve()
    act(() => {
      firstSave = result.current.saveNow()
    })
    act(() => result.current.setValue("second"))
    let secondSave: Promise<void> = Promise.resolve()
    act(() => {
      secondSave = result.current.saveNow()
    })

    await waitFor(() => expect(order).toEqual(["start first"]))
    release()
    await act(async () => {
      await Promise.all([firstSave, secondSave])
    })

    expect(order).toEqual(["start first", "end first", "start second", "end second"])
  })
})
