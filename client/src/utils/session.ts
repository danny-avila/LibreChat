import { getTokenHeader } from 'librechat-data-provider';

/**
 * The account whose credentials requests are currently going out with.
 *
 * Read from the Authorization header rather than from React state, because the
 * two do not change together: `setUserContext` installs the new header in one
 * synchronous call, while a Recoil set or an effect publishes the user later.
 * Work queued by one account and sent during that gap would be attributed to
 * the previous user while travelling as the new one.
 *
 * The claim, not the token, is what is compared: a silent refresh rotates the
 * token for the same account, and treating that as a different session would
 * throw away work the user is still entitled to.
 */
export const getSessionUserId = (): string | undefined => {
  const header = getTokenHeader();
  if (header == null) {
    return undefined;
  }
  const claims = decodeClaims(header.replace(/^Bearer /, ''));
  return typeof claims?.id === 'string' ? claims.id : undefined;
};

const decodeClaims = (token: string): { id?: unknown } | undefined => {
  const payload = token.split('.')[1];
  if (payload == null) {
    return undefined;
  }
  try {
    /* base64url, so the alphabet differs and the padding is dropped. */
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    /* An opaque or malformed token attributes to no one, which is refused
     * rather than assumed to match. */
    return undefined;
  }
};
