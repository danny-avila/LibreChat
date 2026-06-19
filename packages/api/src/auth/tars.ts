import { logger } from '@librechat/data-schemas';

/**
 * A pwc_tars menu node — the unit of authorization in pwc_tars (a UI feature,
 * binary access). The login response returns the union of menus across all the
 * user's effective roles as a tree. Stored verbatim so LibreChat can gate the
 * pwc_tars features it integrates exactly as pwc_tars does.
 */
export interface TarsMenuItem {
  id: number;
  title?: string;
  parent?: string | null;
  type?: string;
  url?: string | null;
  dom_id?: string;
  icon?: string;
  status?: number;
  children?: TarsMenuItem[];
}

/** Normalized pwc_tars user + authorization context after a successful login. */
export interface TarsUser {
  id: string;
  username: string;
  email: string;
  name?: string;
  avatar?: string;
  status: string;
  licenseStatus: string;
  roleId: number | null;
  groupIds: string | null;
  menuItems: TarsMenuItem[];
}

interface TarsLoginResponseUser {
  id: string;
  username: string;
  email: string;
  display_name?: string | null;
  avatar?: string | null;
  status?: string | null;
  role_id?: number | null;
  user_group_id?: string | null;
}

interface TarsLoginResponse {
  token?: string;
  user?: TarsLoginResponseUser;
  menu_items?: TarsMenuItem[];
  license_status?: string | null;
}

const DEFAULT_TIMEOUT_MS = 15000;
const LOGOUT_TIMEOUT_MS = 5000;

const normalizeTarsUser = (
  user: TarsLoginResponseUser,
  menuItems: TarsMenuItem[],
  licenseStatus: string,
): TarsUser => ({
  id: user.id,
  username: user.username,
  email: user.email,
  name: user.display_name ?? user.username,
  avatar: user.avatar ?? undefined,
  status: user.status ?? 'active',
  licenseStatus,
  roleId: user.role_id ?? null,
  groupIds: user.user_group_id ?? null,
  menuItems,
});

/**
 * Recursively collects a flat set of menu access keys (`dom_id` and `url`) from
 * a pwc_tars menu tree, for O(1) backend gating of integrated pwc_tars features.
 */
export function flattenTarsMenuKeys(items: TarsMenuItem[]): string[] {
  const keys = new Set<string>();
  const visit = (nodes: TarsMenuItem[]): void => {
    for (const node of nodes) {
      if (node.dom_id) {
        keys.add(node.dom_id);
      }
      if (node.url) {
        keys.add(node.url);
      }
      if (node.children?.length) {
        visit(node.children);
      }
    }
  };
  visit(items);
  return [...keys];
}

/** Parses the comma-separated `TARS_ADMIN_ROLE_IDS` env into numeric role ids (default `[1]`). */
export function parseTarsAdminRoleIds(
  raw: string | undefined = process.env.TARS_ADMIN_ROLE_IDS,
): number[] {
  if (!raw?.trim()) {
    return [1];
  }
  const ids = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id));
  return ids.length ? ids : [1];
}

/** Whether a pwc_tars role id maps to a LibreChat ADMIN. */
export function isTarsAdminRole(
  roleId: number | null,
  adminRoleIds: number[] = parseTarsAdminRoleIds(),
): boolean {
  return roleId != null && adminRoleIds.includes(roleId);
}

/** Whether a stored set of pwc_tars menu keys grants access to a given menu key (dom_id or url). */
export function hasTarsMenuAccess(menuKeys: string[] | undefined, key: string): boolean {
  return !!menuKeys && menuKeys.includes(key);
}

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
  useSso = false,
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
      body: JSON.stringify({ username, password, use_sso: useSso }),
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

    return normalizeTarsUser(data.user, data.menu_items ?? [], data.license_status ?? 'activate');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error(`[authenticateTars] Request to ${url} timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Best-effort notification to pwc_tars that a user logged out (`POST /api/auth/logout`),
 * so pwc_tars can update its `last_active_at`. Never throws — logout must not depend on it.
 */
export async function notifyTarsLogout(
  tarsId: string,
  baseUrl: string | undefined = process.env.TARS_AUTH_URL,
): Promise<void> {
  if (!baseUrl || !tarsId) {
    return;
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/api/auth/logout`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS);

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: tarsId }),
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`[notifyTarsLogout] Failed to notify pwc_tars logout for ${tarsId}: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }
}

/** Whether pwc_tars has SSO enabled and, if so, the normalized provider type. */
export interface TarsSsoStatus {
  enabled: boolean;
  type: 'ldap' | 'oidc' | 'saml' | null;
}

const TARS_SSO_TYPE_MAP: Record<string, TarsSsoStatus['type']> = {
  '1': 'ldap',
  ldap: 'ldap',
  '2': 'oidc',
  oidc: 'oidc',
  '3': 'saml',
  saml: 'saml',
};

const normalizeTarsSsoType = (type: unknown): TarsSsoStatus['type'] => {
  if (typeof type !== 'string') {
    return null;
  }
  return TARS_SSO_TYPE_MAP[type.toLowerCase()] ?? null;
};

/**
 * Reads pwc_tars SSO status (`GET /api/auth/sso/status`) so LibreChat's login page can
 * decide whether to offer the SSO (LDAP) option. Best-effort: any failure resolves to
 * `{ enabled: false, type: null }` so login simply falls back to local credentials.
 */
export async function getTarsSsoStatus(
  baseUrl: string | undefined = process.env.TARS_AUTH_URL,
): Promise<TarsSsoStatus> {
  const disabled: TarsSsoStatus = { enabled: false, type: null };
  if (!baseUrl) {
    return disabled;
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/api/auth/sso/status`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return disabled;
    }
    const data = (await response.json()) as { enabled?: boolean; type?: unknown };
    return { enabled: !!data?.enabled, type: normalizeTarsSsoType(data?.type) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`[getTarsSsoStatus] Failed to read pwc_tars SSO status: ${reason}`);
    return disabled;
  } finally {
    clearTimeout(timeout);
  }
}
