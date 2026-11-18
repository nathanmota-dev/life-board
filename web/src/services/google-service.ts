import { api } from "@/services/api-client"
import type { OkResponse } from "@/types/api"
import type { GoogleConnectStart, GoogleCredentialsInput, GoogleStatus, GoogleSyncResult } from "@/types/google"

export const googleService = {
  status: () => api.get<GoogleStatus>("/google/status"),
  saveCredentials: (input: GoogleCredentialsInput) => api.put<GoogleStatus>("/google/credentials", input),
  clearCredentials: () => api.delete<OkResponse>("/google/credentials"),
  connect: () => api.post<GoogleConnectStart>("/google/connect"),
  cancelConnect: () => api.delete<OkResponse>("/google/connect"),
  disconnect: () => api.delete<OkResponse>("/google/disconnect"),
  sync: () => api.post<GoogleSyncResult>("/google/sync"),
}
