export function isIntegrationReconnectApiError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const response = (error as { response?: { status?: number; data?: { error?: string } } })
    .response;
  const status = response?.status;
  const message = response?.data?.error ?? (error as { message?: string }).message ?? '';

  if (status === 401 || status === 404) {
    return /not connected|reconnect required|access token/i.test(message);
  }

  return false;
}
