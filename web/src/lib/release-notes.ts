import { createElement, type ReactNode } from "react"

const formatting: Record<string, string> = {
  p: "mb-2 last:mb-0",
  br: "",
  h1: "mb-2 mt-3 text-lg font-semibold text-foreground",
  h2: "mb-2 mt-3 text-base font-semibold text-foreground",
  h3: "mb-1 mt-3 font-semibold text-foreground",
  h4: "mb-1 mt-3 font-semibold text-foreground",
  h5: "mb-1 mt-3 font-semibold text-foreground",
  h6: "mb-1 mt-3 font-semibold text-foreground",
  ul: "mb-2 list-disc space-y-1 pl-5",
  ol: "mb-2 list-decimal space-y-1 pl-5",
  li: "",
  strong: "font-semibold",
  b: "font-semibold",
  em: "italic",
  i: "italic",
  del: "line-through",
  s: "line-through",
  blockquote: "my-2 border-l-2 border-primary pl-3",
  pre: "my-2 overflow-auto whitespace-pre-wrap rounded bg-muted p-2",
  code: "rounded bg-muted px-1 font-mono text-xs",
  hr: "my-3 border-border",
}
const hidden = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "svg", "math"])

export function renderReleaseNotes(notes: string): ReactNode {
  const document = new DOMParser().parseFromString(notes, "text/html")

  function renderNode(node: Node, key: number): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent
    if (node.nodeType !== Node.ELEMENT_NODE) return null
    const tag = (node as Element).localName
    if (hidden.has(tag)) return null
    const children = Array.from(node.childNodes, renderNode)
    // Rebuild formatting only. Never copy release HTML attributes or URLs into the app.
    if (!Object.hasOwn(formatting, tag)) return children
    const props = { key, className: formatting[tag] }
    return tag === "br" || tag === "hr" ? createElement(tag, props) : createElement(tag, props, children)
  }

  const children = Array.from(document.body.childNodes, renderNode)
  return document.body.children.length ? children : createElement("span", { className: "whitespace-pre-wrap" }, children)
}
