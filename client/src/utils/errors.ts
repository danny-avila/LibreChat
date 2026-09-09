import axios from 'axios';

/**
 * Returns the HTTP response status code from an error, regardless of the
 * HTTP client used.  Handles Axios errors first, then falls back to checking
 * for a plain `status` property so callers never need to import axios.
 */
export const getResponseStatus = (error: unknown): number | undefined => {
  if (axios.isAxiosError(error)) {
    return error.response?.status;
  }
  if (error != null && typeof error === 'object' && 'status' in error) {
    const { status } = error as { status: unknown };
    if (typeof status === 'number') {
      return status;
    }
  }
  return undefined;
};

export const isNotFoundError = (error: unknown): boolean => getResponseStatus(error) === 404;

type ApiErrorData = {
  error?: unknown;
  message?: unknown;
  agent_ids?: unknown;
};

/**
 * Safely extracts the `response.data` payload from an error, regardless of
 * the HTTP client used, so callers never need to import axios.
 */
const getApiErrorData = (error: unknown): ApiErrorData | undefined => {
  if (error == null || typeof error !== 'object' || !('response' in error)) {
    return undefined;
  }
  const { response } = error as { response: unknown };
  if (response == null || typeof response !== 'object' || !('data' in response)) {
    return undefined;
  }
  const { data } = response as { data: unknown };
  if (data == null || typeof data !== 'object') {
    return undefined;
  }
  return data as ApiErrorData;
};

/**
 * Returns the server's error message from a failed API response, preferring
 * `response.data.error` over `response.data.message`; falls back to the
 * provided message when the server sent no usable string.
 */
export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const data = getApiErrorData(error);
  if (typeof data?.error === 'string' && data.error.trim()) {
    return data.error;
  }
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message;
  }
  return fallback;
};

/**
 * Returns the offending agent ids from a failed API response when the server
 * included them as a non-empty `response.data.agent_ids` string array.
 */
export const getApiErrorAgentIds = (error: unknown): string[] | undefined => {
  const ids = getApiErrorData(error)?.agent_ids;
  if (Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === 'string')) {
    return ids;
  }
  return undefined;
};
