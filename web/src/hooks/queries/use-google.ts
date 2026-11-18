import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { openExternal } from "@/lib/external"
import { googleStatusInterval } from "@/lib/google"
import { googleService } from "@/services/google-service"

export function useGoogleStatus() {
  return useQuery({
    queryKey: [...queryKeys.google, "status"],
    queryFn: googleService.status,
    refetchInterval: (query) => googleStatusInterval(query.state.data?.pending),
  })
}

export function useSaveGoogleCredentials() {
  return useInvalidatingMutation(googleService.saveCredentials, [queryKeys.google])
}

export function useClearGoogleCredentials() {
  return useInvalidatingMutation(googleService.clearCredentials, [queryKeys.google])
}

/** Starts the login and opens Google's consent page in the default browser. */
export function useConnectGoogle() {
  return useInvalidatingMutation(async () => {
    const { authUrl } = await googleService.connect()
    openExternal(authUrl)
  }, [queryKeys.google])
}

export function useCancelGoogleConnect() {
  return useInvalidatingMutation(googleService.cancelConnect, [queryKeys.google])
}

export function useDisconnectGoogle() {
  return useInvalidatingMutation(googleService.disconnect, [queryKeys.google])
}
