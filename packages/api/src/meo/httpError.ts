/** Safe status and message for the browser; upstream response bodies stay server-side. */
export class MeoHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MeoHttpError';
  }
}

export function meoErrorResponse(error: unknown): { status: number; message: string } {
  if (error instanceof MeoHttpError) return { status: error.status, message: error.message };
  return { status: 502, message: 'Meo service is unavailable. Try again later.' };
}

export function meoUpstreamError(status: number): MeoHttpError {
  if (status === 401) return new MeoHttpError(401, 'Meo Account session expired. Sign in again.');
  if (status === 403)
    return new MeoHttpError(403, 'Account verification is required or access was denied.');
  if (status === 404) return new MeoHttpError(404, 'The requested Meo resource was not found.');
  if (status === 409)
    return new MeoHttpError(409, 'This confirmation expired or changed. Review and try again.');
  if (status === 429) return new MeoHttpError(429, 'Too many requests. Try again later.');
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return new MeoHttpError(status, 'Meo rejected this request. Check the input and try again.');
  }
  return new MeoHttpError(
    status >= 500 && status <= 599 ? status : 502,
    'Meo service is unavailable. Try again later.',
  );
}
