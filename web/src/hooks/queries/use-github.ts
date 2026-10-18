import { useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { githubService } from "@/services/github-service"
import type { GithubIssueKind, GithubKind } from "@/types/github"

export function useGithubStatus() {
  return useQuery({ queryKey: [...queryKeys.github, "status"], queryFn: githubService.status })
}

export function useGithubPrs(kind?: GithubKind, enabled = true) {
  return useQuery({ queryKey: [...queryKeys.github, "prs", kind], queryFn: () => githubService.prs(kind), enabled })
}

export function useGithubIssues(kind?: GithubIssueKind) {
  return useQuery({ queryKey: [...queryKeys.github, "issues", kind], queryFn: () => githubService.issues(kind) })
}

export function useContributions(enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.github, "contributions"],
    queryFn: githubService.contributions,
    enabled,
    staleTime: 15 * 60 * 1000,
  })
}

export function useConnectGithub() {
  return useInvalidatingMutation(githubService.connect, [queryKeys.github])
}

export function useDisconnectGithub() {
  return useInvalidatingMutation(githubService.disconnect, [queryKeys.github])
}

export function useSyncGithub() {
  return useInvalidatingMutation(githubService.sync, [queryKeys.github])
}

/** The sync mutation, fired once each time the caller mounts. */
export function useAutoSyncGithub() {
  const sync = useSyncGithub()
  const { mutate } = sync
  // A ref, so StrictMode's double effect (and later status refetches) don't sync again.
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    mutate(undefined)
  }, [mutate])

  return sync
}
