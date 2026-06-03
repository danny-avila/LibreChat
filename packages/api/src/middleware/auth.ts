type AuthFailureLike = {
  message?: unknown;
  name?: unknown;
};

type AuthLogValue = string | number | boolean | readonly string[];
type AuthLogHeaderValue = string | string[] | undefined;

export type AuthLogRequest = {
  headers?: Record<string, AuthLogHeaderValue>;
  method?: string;
  path?: string;
  originalUrl?: string;
  url?: string;
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

function getRequestPath(req: AuthLogRequest): string | undefined {
  const path = normalizeAuthLogValue(req.path) ?? normalizeAuthLogValue(req.originalUrl ?? req.url);
  return path?.split('?')[0];
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
    token_provider: normalizeAuthLogValue(authState.tokenProvider),
    openid_reuse_enabled: authState.openidReuseEnabled,
    openid_jwt_available: authState.openidJwtAvailable,
    has_openid_reuse_user_id: authState.hasOpenIdReuseUserId,
  });
}
