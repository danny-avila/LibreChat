/**
 * Hand-off channel for the required-enrollment setup token.
 *
 * The token is a bearer credential in its own right: it can generate a TOTP secret of the
 * holder's choosing and then drive confirm, acknowledge, and finalize into a real session, with
 * no victim secret involved. Carrying it in the query string would leave it in browser history,
 * in access and reverse-proxy logs, and potentially in a Referer header, so it is handed to the
 * setup screen out of band instead.
 *
 * Session storage survives the hard navigation the response interceptor performs and is scoped to
 * the one tab. The in-memory mirror keeps the flow working where storage is blocked and the
 * navigation stays inside the SPA.
 */

const SETUP_TOKEN_STORAGE_KEY = 'two_factor_setup_token';

interface TwoFactorSetupWindow extends Window {
  __librechatTwoFactorSetupToken?: string;
}

export function persistTwoFactorSetupToken(tempToken: string): void {
  const trimmed = tempToken.trim();
  (window as TwoFactorSetupWindow).__librechatTwoFactorSetupToken = trimmed;
  try {
    window.sessionStorage.setItem(SETUP_TOKEN_STORAGE_KEY, trimmed);
  } catch {
    // Session storage can be blocked in embedded or private contexts.
  }
}

export function readTwoFactorSetupToken(): string {
  try {
    const stored = window.sessionStorage.getItem(SETUP_TOKEN_STORAGE_KEY)?.trim();
    if (stored) {
      return stored;
    }
  } catch {
    // Fall through to the in-memory mirror.
  }

  return (window as TwoFactorSetupWindow).__librechatTwoFactorSetupToken?.trim() ?? '';
}

export function clearTwoFactorSetupToken(): void {
  delete (window as TwoFactorSetupWindow).__librechatTwoFactorSetupToken;
  try {
    window.sessionStorage.removeItem(SETUP_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}
