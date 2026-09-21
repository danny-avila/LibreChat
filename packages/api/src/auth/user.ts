import type { AuthIdentitySource } from '~/utils/identity';
import { resolveAppUserId } from '~/utils/identity';

type AuthResponseSource = AuthIdentitySource & {
  password?: unknown;
  __v?: unknown;
  totpSecret?: unknown;
  backupCodes?: unknown;
  federatedTokens?: unknown;
};

/** Keeps the authenticated identity stable between refresh and user responses. */
export function sanitizeUserForAuthResponse<T extends AuthResponseSource>(
  user?: (T & { toObject?: () => T }) | null,
): Omit<
  Partial<T>,
  'password' | '__v' | 'totpSecret' | 'backupCodes' | 'federatedTokens' | 'id'
> & {
  id: string | undefined;
} {
  const source: Partial<T> = (typeof user?.toObject === 'function' ? user.toObject() : user) || {};
  const {
    id: _id,
    password: _pw,
    __v: _v,
    totpSecret: _ts,
    backupCodes: _bc,
    federatedTokens: _ft,
    ...safeUser
  } = source;
  return { ...safeUser, id: resolveAppUserId(source) };
}
