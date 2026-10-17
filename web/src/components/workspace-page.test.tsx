import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { WorkspacePage } from "@/components/workspace-page"

describe("WorkspacePage", () => {
  it("renders the provided title as the page heading", () => {
    render(<WorkspacePage title="Tasks" />)

    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument()
  })
})
