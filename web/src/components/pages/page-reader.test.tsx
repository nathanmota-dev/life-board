import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PageReader } from "@/components/pages/page-reader"

const TABLE = "| item | qty |\n|---|---|\n| milk | 1 |\n"

describe("PageReader", () => {
  it("renders headings, a GFM table, a task list and a code block", () => {
    render(<PageReader markdown={`# Groceries\n\n${TABLE}\n- [x] milk\n- [ ] eggs\n\n~~old~~\n\n\`\`\`\nlet a = 1\n\`\`\`\n`} />)

    expect(screen.getByRole("heading", { name: "Groceries", level: 1 })).toBeInTheDocument()
    expect(within(screen.getByRole("table")).getByRole("cell", { name: "milk" })).toBeInTheDocument()
    const [done, todo] = screen.getAllByRole("checkbox")
    expect(done).toBeChecked()
    expect(todo).not.toBeChecked()
    expect(done).toBeDisabled()
    expect(todo).toBeDisabled()
    expect(screen.getByText("old").tagName).toBe("DEL")
    expect(screen.getByText("let a = 1").closest("pre")).not.toBeNull()
  })

  it("loads an http image", () => {
    render(<PageReader markdown="![A cat](https://example.com/cat.png)" />)
    expect(screen.getByRole("img", { name: "A cat" })).toHaveAttribute("src", "https://example.com/cat.png")
  })

  it("shows the alt text of a relative or file: image instead of loading it", () => {
    render(<PageReader markdown={"![Local one](images/cat.png)\n\n![Disk one](file:///home/me/cat.png)"} />)

    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.getByText("Local one")).toBeInTheDocument()
    expect(screen.getByText("Disk one")).toBeInTheDocument()
  })

  it("shows raw HTML as text, never as markup", () => {
    const { container } = render(<PageReader markdown={'<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n'} />)

    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("img")).toBeNull()
    expect(container).toHaveTextContent("<script>alert(1)</script>")
    expect(container).toHaveTextContent('<img src="x" onerror="alert(2)">')
  })

  it("doesn't navigate when a link is clicked", () => {
    render(<PageReader markdown="[GitHub](https://github.com)" />)
    const link = screen.getByRole("link", { name: "GitHub" })

    // fireEvent returns false when the click's default action (following the link) was prevented.
    expect(fireEvent.click(link)).toBe(false)
  })
})
