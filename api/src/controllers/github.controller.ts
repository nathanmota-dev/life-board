import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { okResponse } from "../dto/common.dto"
import { connectGithubBody, listIssuesQuery, listPrsQuery, recentReposQuery } from "../dto/github.dto"

export const githubController: FastifyPluginAsyncZod = async (app) => {
  const { github } = app.services

  app.get("/github/status", () => github.status())

  app.post("/github/connect", { schema: { body: connectGithubBody } }, (request) =>
    github.connect(request.body),
  )

  app.delete("/github/disconnect", async () => {
    await github.disconnect()
    return okResponse
  })

  app.post("/github/sync", () => github.sync())

  app.get("/github/contributions", () => github.contributions())

  app.get("/github/repos/recent", { schema: { querystring: recentReposQuery } }, async (request) => ({
    items: await github.recentRepos(request.query),
  }))

  app.get("/github/prs", { schema: { querystring: listPrsQuery } }, async (request) => ({
    items: await github.listPrs(request.query),
  }))

  app.get("/github/issues", { schema: { querystring: listIssuesQuery } }, async (request) => ({
    items: await github.listIssues(request.query),
  }))
}
