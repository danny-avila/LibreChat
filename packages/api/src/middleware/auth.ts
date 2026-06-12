type AuthFailureLike = {
  message?: unknown;
  name?: unknown;
};

type AuthLogValue = string | number | boolean | readonly string[];
type AuthLogHeaderValue = string | string[] | undefined;
type AuthRoutePath = string | RegExp | readonly (string | RegExp)[];

export type AuthLogRequest = {
  headers?: Record<string, AuthLogHeaderValue>;
  method?: string;
  path?: string;
  originalUrl?: string;
  url?: string;
  baseUrl?: string;
  route?: {
    path?: AuthRoutePath;
  };
  id?: string;
  requestId?: string;
};

export type AuthLogState = {
  tokenProvider?: string | null;
  openidReuseEnabled: boolean;
  openidJwtAvailable: boolean;
  hasOpenIdReuseUserId: boolean;
};

export type AuthLogContext = Record<string, AuthLogValue>;

function normalizeAuthLogValue(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeAuthLogValue(entry);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

function normalizeAuthLogContextValue(value: unknown): AuthLogValue | undefined {
  if (value == null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const values = value
      .map((entry) => normalizeAuthLogValue(entry))
      .filter((entry): entry is string => entry !== undefined);
    return values.length > 0 ? values : undefined;
  }

  if (typeof value === 'string') {
    return normalizeAuthLogValue(value);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return undefined;
}

function getRequestId(req: AuthLogRequest): string | undefined {
  return (
    normalizeAuthLogValue(req.requestId) ??
    normalizeAuthLogValue(req.id) ??
    normalizeAuthLogValue(req.headers?.['x-request-id']) ??
    normalizeAuthLogValue(req.headers?.['x-correlation-id'])
  );
}

function normalizeRoutePath(path: AuthRoutePath | undefined): string | undefined {
  if (typeof path === 'string') {
    return normalizeAuthLogValue(path);
  }

  if (Array.isArray(path)) {
    for (const entry of path) {
      const normalized = normalizeRoutePath(entry);
      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}

function joinRoutePath(baseUrl: string | undefined, routePath: string): string {
  const normalizedRoute = routePath === '/' ? '' : routePath;
  if (!baseUrl) {
    return normalizedRoute || '/';
  }
  if (!normalizedRoute) {
    return baseUrl;
  }
  return `${baseUrl.replace(/\/$/, '')}/${normalizedRoute.replace(/^\//, '')}`;
}

function bucketConcretePath(path: string | undefined): string | undefined {
  const queryless = path?.split('?')[0];
  if (!queryless) {
    return undefined;
  }

  const segments = queryless.split('/').filter(Boolean);
  if (segments.length === 0) {
    return '/';
  }
  if (segments[0] === 'api' && segments[1]) {
    return `/${segments.slice(0, 2).join('/')}`;
  }
  return `/${segments[0]}`;
}

function getRequestPath(req: AuthLogRequest): string | undefined {
  const baseUrl = normalizeAuthLogValue(req.baseUrl);
  const routePath = normalizeRoutePath(req.route?.path);
  if (routePath) {
    return joinRoutePath(baseUrl, routePath);
  }
  if (baseUrl) {
    return baseUrl;
  }

  const path = normalizeAuthLogValue(req.path) ?? normalizeAuthLogValue(req.originalUrl ?? req.url);
  return bucketConcretePath(path);
}

function getAuthFailureField(source: unknown, field: keyof AuthFailureLike): unknown {
  if (!source) {
    return undefined;
  }
  if (typeof source === 'string') {
    return field === 'message' ? source : undefined;
  }
  if (typeof source === 'object') {
    try {
      return (source as AuthFailureLike)[field];
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function compactAuthLogContext(log: Record<string, unknown>): AuthLogContext {
  const compacted: Partial<AuthLogContext> = {};
  for (const key of Object.keys(log)) {
    const value = normalizeAuthLogContextValue(log[key]);
    if (value !== undefined) {
      Object.assign(compacted, { [key]: value });
    }
  }
  return compacted as AuthLogContext;
}

export function getAuthFailureReason(
  err: unknown,
  info: unknown,
  fallback = 'Unauthorized',
): string {
  return (
    normalizeAuthLogValue(getAuthFailureField(info, 'message')) ??
    normalizeAuthLogValue(getAuthFailureField(err, 'message')) ??
    fallback
  );
}

export function getAuthFailureErrorName(err: unknown, info: unknown): string | undefined {
  return (
    normalizeAuthLogValue(getAuthFailureField(info, 'name')) ??
    normalizeAuthLogValue(getAuthFailureField(err, 'name'))
  );
}

function getSafeTokenProvider(tokenProvider: unknown): string | undefined {
  const normalized = normalizeAuthLogValue(tokenProvider);
  if (!normalized) {
    return undefined;
  }
  return normalized === 'openid' || normalized === 'librechat' ? normalized : 'other';
}

export function buildSafeAuthLogContext(
  req: AuthLogRequest,
  authState: AuthLogState,
  extra: Record<string, unknown> = {},
): AuthLogContext {
  return compactAuthLogContext({
    ...extra,
    request_id: getRequestId(req),
    method: normalizeAuthLogValue(req.method),
    path: getRequestPath(req),
    token_provider: getSafeTokenProvider(authState.tokenProvider),
    openid_reuse_enabled: authState.openidReuseEnabled,
    openid_jwt_available: authState.openidJwtAvailable,
    has_openid_reuse_user_id: authState.hasOpenIdReuseUserId,
  });
}

export function formatAuthLogMessage(message: string, context: AuthLogContext): string {
  return `${message} ${JSON.stringify(context)}`;
}
