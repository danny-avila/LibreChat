/**
 * Shared error helpers for the subscription action dialogs. Maps backend
 * error codes (in the AdminErrorResponse shape) to friendly user-facing
 * messages.
 */

type MaybeAxiosError = {
  response?: {
    status?: number;
    data?: { code?: string; message?: string };
  };
  message?: string;
};

export function getServerError(err: unknown): { code?: string; message: string } {
  const e = err as MaybeAxiosError;
  const code = e?.response?.data?.code;
  const message = e?.response?.data?.message ?? e?.message ?? 'Something went wrong.';
  return { code, message };
}

export function friendlyErrorMessage(err: unknown): string {
  const { code, message } = getServerError(err);
  switch (code) {
    case 'USER_NOT_FOUND':
      return 'That user no longer exists.';
    case 'NO_SUBSCRIPTION':
      return 'This user has no subscription record yet.';
    case 'FRESH_AUTH_REQUIRED':
      return 'Recent authentication required — please confirm your password and try again.';
    case 'INVALID_REQUEST':
      return message || 'The request was invalid.';
    case 'REVENUECAT_ERROR':
      return 'RevenueCat sync failed. Try again in a moment.';
    default:
      return message;
  }
}
