import { ErrorTypes } from 'librechat-data-provider';

export const OAuthErrorCodes = {
  AUTH_FAILED: ErrorTypes.AUTH_FAILED,
  OAUTH_ACCOUNT_MISMATCH: 'oauth_account_mismatch',
  OAUTH_EMAIL_DOMAIN_BLOCKED: 'oauth_email_domain_blocked',
  OAUTH_REGISTRATION_DISABLED: 'oauth_registration_disabled',
  OAUTH_USER_NOT_FOUND: 'oauth_user_not_found',
  OPENID_ISSUER_MISMATCH: 'openid_issuer_mismatch',
  OPENID_ROLE_REQUIRED: 'openid_role_required',
} as const;

export type OAuthErrorCode = (typeof OAuthErrorCodes)[keyof typeof OAuthErrorCodes];

const KNOWN_OAUTH_FAILURE_CODES = new Set<string>(Object.values(OAuthErrorCodes));

export function isKnownOAuthErrorCode(value: unknown): value is OAuthErrorCode {
  return typeof value === 'string' && KNOWN_OAUTH_FAILURE_CODES.has(value);
}

export function getOAuthErrorCode(message: unknown): OAuthErrorCode {
  if (isKnownOAuthErrorCode(message)) {
    return message;
  }
  if (message === 'Email domain not allowed') {
    return OAuthErrorCodes.OAUTH_EMAIL_DOMAIN_BLOCKED;
  }
  if (message === 'Social registration is disabled') {
    return OAuthErrorCodes.OAUTH_REGISTRATION_DISABLED;
  }
  if (message === 'User does not exist') {
    return OAuthErrorCodes.OAUTH_USER_NOT_FOUND;
  }
  if (typeof message === 'string' && message.includes('role to log in')) {
    return OAuthErrorCodes.OPENID_ROLE_REQUIRED;
  }
  return OAuthErrorCodes.AUTH_FAILED;
}
