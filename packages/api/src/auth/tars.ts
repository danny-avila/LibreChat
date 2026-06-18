import { logger } from '@librechat/data-schemas';

/** Normalized pwc_tars user returned after a successful credential check. */
export interface TarsUser {
  id: string;
  username: string;
  email: string;
  name?: string;
  avatar?: string;
}

interface TarsLoginResponseUser {
  id: string;
  username: string;
  email: string;
  display_name?: string | null;
  avatar?: string | null;
}

interface TarsLoginResponse {
  token?: string;
  user?: TarsLoginResponseUser;
}

const DEFAULT_TIMEOUT_MS = 15000;

const normalizeTarsUser = (user: TarsLoginResponseUser): TarsUser => ({
  id: user.id,
  username: user.username,
  email: user.email,
  name: user.display_name ?? user.username,
  avatar: user.avatar ?? undefined,
});

/**
 * Verifies credentials against the pwc_tars Flask backend (`POST /api/auth/login`).
 * pwc_tars is the source of truth for authentication; LibreChat issues its own
 * tokens after this call succeeds.
 *
 * @returns the normalized tars user on success, or `null` when the backend
 *          rejects the credentials (401/403) or returns an unexpected payload.
 *          Connection/timeout failures throw so the strategy can surface a 5xx.
 */
export async function authenticateTars(
  username: string,
  password: string,
  baseUrl: string | undefined = process.env.TARS_AUTH_URL,
): Promise<TarsUser | null> {
  if (!baseUrl) {
    throw new Error('TARS_AUTH_URL is not configured');
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/api/auth/login`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, use_sso: false }),
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return null;
    }

    if (!response.ok) {
      logger.error(`[authenticateTars] Unexpected status ${response.status} from ${url}`);
      throw new Error(`pwc_tars auth returned status ${response.status}`);
    }

    const data = (await response.json()) as TarsLoginResponse;
    if (!data?.user?.id) {
      logger.error('[authenticateTars] Missing user in pwc_tars login response');
      return null;
    }

    return normalizeTarsUser(data.user);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error(`[authenticateTars] Request to ${url} timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
