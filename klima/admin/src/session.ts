import { parseJson } from './json';

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

export type DeniedReason = 'unauthenticated' | 'forbidden' | 'error';

export type SessionState =
  | { status: 'loading' }
  | { status: 'authorized'; user: AdminUser; token: string }
  | { status: 'denied'; reason: DeniedReason; httpStatus: number; message: string };

interface RawUser {
  _id?: string;
  id?: string;
  email?: string;
  username?: string;
  role?: string;
}

interface RefreshResponseBody {
  token?: string;
  user?: RawUser;
}

interface VerifyResponseBody {
  user?: RawUser;
}

export interface RefreshSuccess {
  ok: true;
  token: string;
}

export interface RefreshFailure {
  ok: false;
  httpStatus: number;
  message: string;
}

export type RefreshOutcome = RefreshSuccess | RefreshFailure;

const REFRESH_URL = '/api/auth/refresh';
const VERIFY_URL = '/api/admin/verify';

const toAdminUser = (raw: RawUser | undefined): AdminUser | null => {
  const id = raw?.id ?? raw?._id ?? '';
  if (!id) {
    return null;
  }
  return {
    id,
    email: raw?.email ?? '',
    username: raw?.username ?? '',
    role: raw?.role ?? '',
  };
};

/**
 * The refresh controller answers a missing cookie with `200 'Refresh token not provided'`
 * and a stale session with `res.status(401).redirect('/login')`, which Express sends as a
 * 302 that fetch follows. Neither carries a session, so only a JSON body with a `token` counts.
 */
export const requestAccessToken = async (): Promise<RefreshOutcome> => {
  const response = await fetch(REFRESH_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  const body = await response.text();
  const token = parseJson<RefreshResponseBody>(body)?.token ?? '';
  if (token) {
    return { ok: true, token };
  }

  if (response.redirected) {
    return {
      ok: false,
      httpStatus: 401,
      message: 'The refresh endpoint redirected to the login page: there is no LibreChat session.',
    };
  }

  return {
    ok: false,
    httpStatus: response.status,
    message: 'The refresh endpoint returned no access token: there is no LibreChat session.',
  };
};

const verifyAdmin = async (token: string): Promise<SessionState> => {
  const response = await fetch(VERIFY_URL, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });

  const body = await response.text();

  if (response.status === 401) {
    return {
      status: 'denied',
      reason: 'unauthenticated',
      httpStatus: 401,
      message: 'The access token was rejected. Sign in to LibreChat and reload this page.',
    };
  }

  if (response.status === 403) {
    return {
      status: 'denied',
      reason: 'forbidden',
      httpStatus: 403,
      message:
        'You are signed in to LibreChat, but your role does not carry the admin access permission.',
    };
  }

  if (!response.ok) {
    return {
      status: 'denied',
      reason: 'error',
      httpStatus: response.status,
      message: `The verify endpoint failed: ${body.slice(0, 200) || response.statusText}`,
    };
  }

  const user = toAdminUser(parseJson<VerifyResponseBody>(body)?.user);
  if (!user) {
    return {
      status: 'denied',
      reason: 'error',
      httpStatus: response.status,
      message: 'The verify endpoint returned no user document.',
    };
  }

  return { status: 'authorized', user, token };
};

export const resolveSession = async (): Promise<SessionState> => {
  try {
    const refresh = await requestAccessToken();
    if (!refresh.ok) {
      return {
        status: 'denied',
        reason: refresh.httpStatus === 403 ? 'forbidden' : 'unauthenticated',
        httpStatus: refresh.httpStatus,
        message: refresh.message,
      };
    }
    return await verifyAdmin(refresh.token);
  } catch (error) {
    return {
      status: 'denied',
      reason: 'error',
      httpStatus: 0,
      message: error instanceof Error ? error.message : 'The session check could not be completed.',
    };
  }
};
