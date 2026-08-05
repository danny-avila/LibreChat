import type winston from 'winston';
import {
  getTenantId,
  getUserId,
  getRequestId,
  getRequestMethod,
  getRequestPath,
  SYSTEM_TENANT_ID,
} from './tenantContext';

export const LOG_CONTEXT_KEYS = [
  'tenantId',
  'userId',
  'requestId',
  'request_id',
  'method',
  'path',
] as const;

const IDENTITY_CONTEXT_KEYS = ['tenantId', 'tenant_id', 'userId', 'user_id'] as const;

function isIdentityFreeEvent(eventName: unknown): boolean {
  return (
    typeof eventName === 'string' &&
    (eventName.startsWith('jwt_auth_') || eventName === 'tenant_isolation_error')
  );
}

function getLogTenantId(): string | undefined {
  const tenantId = getTenantId();
  return tenantId === SYSTEM_TENANT_ID ? undefined : tenantId;
}

/**
 * Adds request-scoped context to a log record. Authentication and tenant-isolation
 * events intentionally omit identity fields while retaining request correlation.
 */
export function attachRequestContext(
  info: winston.Logform.TransformableInfo,
): winston.Logform.TransformableInfo {
  const omitIdentity = isIdentityFreeEvent(info.event_name);
  if (omitIdentity) {
    IDENTITY_CONTEXT_KEYS.forEach((key) => delete info[key]);
  } else if (info.tenantId === SYSTEM_TENANT_ID) {
    delete info.tenantId;
  }

  const context = {
    tenantId: omitIdentity ? undefined : getLogTenantId(),
    userId: omitIdentity ? undefined : getUserId(),
    requestId: getRequestId(),
    request_id: getRequestId(),
    method: getRequestMethod(),
    path: getRequestPath(),
  };
  LOG_CONTEXT_KEYS.forEach((key) => {
    if (context[key] && info[key] == null) {
      info[key] = context[key];
    }
  });
  return info;
}
