function getAxiosResponse(error: unknown): { status?: number; data?: unknown } | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const response = (error as { response?: { status?: number; data?: unknown } }).response;
  return response;
}

function getAxiosConfig(error: unknown): { url?: string; method?: string } | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const config = (error as { config?: { url?: string; method?: string } }).config;
  return config;
}

export interface NangoHttpErrorDetails {
  message: string;
  status?: number;
  requestUrl?: string;
  method?: string;
  responseData?: unknown;
}

export function getNangoHttpErrorDetails(error: unknown): NangoHttpErrorDetails {
  const response = getAxiosResponse(error);
  const config = getAxiosConfig(error);
  return {
    message: error instanceof Error ? error.message : String(error),
    status: response?.status,
    requestUrl: config?.url,
    method: config?.method,
    responseData: response?.data,
  };
}

export function isNangoNotFoundError(error: unknown): boolean {
  const response = getAxiosResponse(error);
  if (response?.status === 404) {
    return true;
  }
  if (error instanceof Error) {
    return error.message.includes('status code 404');
  }
  return false;
}

/** Errors that mean "no remote connections to sync" — safe to ignore during list/sync. */
export function isNangoSyncSkippableError(error: unknown): boolean {
  if (isNangoNotFoundError(error)) {
    return true;
  }
  const response = getAxiosResponse(error);
  if (response?.status === 400) {
    return true;
  }
  if (error instanceof Error) {
    return error.message.includes('status code 400');
  }
  return false;
}

export const INTEGRATION_CONFIRM_NOT_FOUND =
  'Integration connection was not found in Nango after authorization';
