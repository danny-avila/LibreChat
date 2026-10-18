import {
  request,
  apiBaseUrl,
  ADMIN_SCOPE_HEADER,
  ADMIN_PLATFORM_SCOPE,
} from 'librechat-data-provider';
import { getAdminScope } from '~/admin/store';

/**
 * Makes an authenticated request to SassyChat's admin API, in the panel's current scope.
 *
 * The signed-in SassyChat session authorizes it (with its token refresh), so the panel holds no
 * credentials of its own. The scope header names the platform or one organization; the server
 * honors it only for the platform operator.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has(ADMIN_SCOPE_HEADER)) {
    headers.set(ADMIN_SCOPE_HEADER, getAdminScope());
  }
  return request.authenticatedFetch(`${apiBaseUrl()}${path}`, { ...init, headers });
}

/**
 * A request about the platform itself (its organizations, accounts and the operator's session),
 * whatever scope the panel is in: an organization being deleted never blocks these.
 */
export function platformFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set(ADMIN_SCOPE_HEADER, ADMIN_PLATFORM_SCOPE);
  return apiFetch(path, { ...init, headers });
}

/**
 * Extract an error message from a failed API response and throw.
 * Handles both `{ error }` and `{ message }` response shapes.
 */
export async function extractApiError(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => ({}));
  const message =
    (body as { error?: string }).error ??
    (body as { message?: string }).message ??
    `${fallback}: ${response.status}`;
  throw new Error(message);
}
