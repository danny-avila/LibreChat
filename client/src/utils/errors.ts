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

export const getResponseErrorCode = <TCode extends string>(error: unknown): TCode | undefined => {
  if (!axios.isAxiosError<{ code?: string }>(error)) {
    return undefined;
  }
  const code = error.response?.data?.code;
  return typeof code === 'string' ? (code as TCode) : undefined;
};
