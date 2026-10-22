const now = "2026-10-21T10:00:00Z"
const user = { login: "synthetic-user", avatar_url: null }
const repository = { nameWithOwner: "synthetic-user/life-board", url: "https://github.com/synthetic-user/life-board", description: "Synthetic repository", isPrivate: false, stargazerCount: 7, primaryLanguage: { name: "TypeScript", color: "#3178c6" } }
const item = (number, title, pull = false) => ({ number, title, state: "open", draft: false, html_url: `https://github.com/synthetic-user/life-board/${pull ? "pull" : "issues"}/${number}`, user, repository_url: "https://api.github.com/repos/synthetic-user/life-board", created_at: now, updated_at: now, labels: [{ name: "e2e" }], comments: 2, ...(pull ? { pull_request: { merged_at: null } } : {}) })

module.exports = function github(url, init, scenario) {
  const headers = new Headers(init?.headers)
  if (headers.get("authorization") !== "Bearer synthetic-token-for-e2e-only" || scenario.github === "unauthorized") return new Response("Bad credentials", { status: 401 })
  if (scenario.github === "error") return new Response("Synthetic GitHub unavailable", { status: 503 })
  if (scenario.github === "rate-limit") return new Response("Synthetic rate limit", { status: 403 })
  const parsed = new URL(url)
  let data
  if (parsed.pathname === "/user") data = { login: user.login }
  else if (parsed.pathname.startsWith("/users/")) data = [{ name: "life-board", owner: { login: user.login } }]
  else if (parsed.pathname === "/search/issues") {
    const query = parsed.searchParams.get("q") || ""
    const pull = query.includes("is:pr")
    const kind = ["author", "review-requested", "mentions", "assignee", "user"].findIndex(qualifier => query.includes(` ${qualifier}:`)) + 1
    data = { items: scenario.github === "empty" ? [] : [item(pull ? kind : kind + 100, pull ? "Synthetic pull request" : "Synthetic issue", pull)] }
  } else if (parsed.pathname.endsWith("/pulls")) data = scenario.github === "empty" ? [] : [{ ...item(5, "Synthetic pull request", true), base: { ref: "main" }, head: { ref: "feature" }, merged_at: null, additions: 12, deletions: 3, changed_files: 2 }]
  else if (/\/pulls\/\d+$/.test(parsed.pathname)) data = { ...item(Number(parsed.pathname.split("/").at(-1)), "Synthetic pull request", true), base: { ref: "main" }, head: { ref: "feature" }, merged_at: null, additions: 12, deletions: 3, changed_files: 2 }
  else if (parsed.pathname === "/graphql") {
    const query = JSON.parse(init.body).query
    const collection = query.includes("contributionCalendar")
      ? { contributionCalendar: { totalContributions: 3, weeks: [{ contributionDays: [{ date: "2026-10-20", contributionCount: 3, contributionLevel: "SECOND_QUARTILE" }] }] } }
      : Object.fromEntries(["commitContributionsByRepository", "pullRequestContributionsByRepository", "pullRequestReviewContributionsByRepository", "issueContributionsByRepository"].map(kind => [kind, scenario.github === "empty" ? [] : [{ repository, contributions: { nodes: [{ occurredAt: now }] } }]]))
    data = { data: { user: { contributionsCollection: collection } } }
  } else throw new Error(`Unexpected GitHub request: ${url}`)
  return Response.json(data)
}
