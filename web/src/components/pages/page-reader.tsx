import type { ComponentProps } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { PageReaderProps } from "@/types/page"

const REMOTE_IMAGE = /^https?:\/\//i

/** Links don't navigate: the app can only open GitHub and Google addresses outside itself. */
function ReaderLink({ node: _node, href, children, ...props }: ComponentProps<"a"> & { node?: unknown }) {
  return (
    <a {...props} href={href} onClick={(event) => event.preventDefault()}>
      {children}
    </a>
  )
}

/** `http(s)` images load; a relative or `file:` path can't be resolved, so its alt text shows instead. */
function ReaderImage({ node: _node, src, alt, ...props }: ComponentProps<"img"> & { node?: unknown }) {
  return typeof src === "string" && REMOTE_IMAGE.test(src) ? (
    <img {...props} src={src} alt={alt ?? ""} loading="lazy" className="max-w-full rounded-lg" />
  ) : (
    <span className="text-muted-foreground">{alt}</span>
  )
}

const COMPONENTS = { a: ReaderLink, img: ReaderImage }

/**
 * A page rendered as formatted markdown. Raw HTML is never turned into markup (there is no
 * `rehype-raw`), so `<script>` or `<img onerror>` in a note shows as text.
 */
export function PageReader({ markdown }: PageReaderProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
