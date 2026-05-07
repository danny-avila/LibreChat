/**
 * Shared error helpers for the Users action dialogs. Maps backend error
 * codes (in the AdminErrorResponse shape) to friendly user-facing messages.
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

/**
 * Map admin user mutation server errors to a friendly message.
 * The wrapper `useAdminMutation` already handles `FRESH_AUTH_REQUIRED`.
 */
export function friendlyUserError(err: unknown): string {
  const { code, message } = getServerError(err);
  switch (code) {
    case 'USER_NOT_FOUND':
      return 'That user no longer exists.';
    case 'CANNOT_BAN_SELF':
      return 'You cannot ban yourself.';
    case 'CANNOT_DELETE_SELF':
      return 'You cannot delete your own account from here.';
    case 'CANNOT_DEMOTE_SELF':
      return 'You cannot change your own role.';
    case 'LAST_ADMIN':
      return 'Cannot demote the last admin.';
    case 'EMAIL_MISMATCH':
      return 'The email confirmation does not match this user.';
    case 'EMAIL_NOT_CONFIGURED':
      return 'Email is not configured on the server, so password resets cannot be sent.';
    case 'USER_BANNED':
      return 'That email belongs to a banned account.';
    case 'USER_EXISTS':
      return 'A user with that email already exists.';
    case 'INVALID_REQUEST':
      return message || 'The request was invalid.';
    case 'FRESH_AUTH_REQUIRED':
      return 'Recent authentication required — please confirm your password and try again.';
    default:
      return message;
  }
}
