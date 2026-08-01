import { createHash } from 'node:crypto';
import { SystemRoles } from 'librechat-data-provider';
import type { IUser, CreateUserRequest, BalanceConfig } from '@librechat/data-schemas';
import type { FilterQuery, Types } from 'mongoose';
import type { ExodeExchangeUser, ExodeIdentity } from './types';
import { ExodeExchangeError } from './types';
import { normalizeOpenIdIssuer } from '~/auth/openid';

export interface ExodeUserDeps {
  findUser: (criteria: FilterQuery<IUser>) => Promise<IUser | null>;
  createUser: (
    data: CreateUserRequest,
    balanceConfig?: BalanceConfig,
    disableTTL?: boolean,
    returnUser?: boolean,
  ) => Promise<Types.ObjectId | Partial<IUser>>;
  updateUser: (userId: string, updateData: Partial<IUser>) => Promise<IUser | null>;
  /**
   * The deployment's balance settings, as every other registration path passes them.
   * Omitted, no Balance record is created and the account cannot spend anything on a
   * deployment that runs with CHECK_BALANCE — the user reaches the chat and every message fails.
   */
  balanceConfig?: BalanceConfig;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

function getTechnicalEmail(subject: string, issuer: string): string {
  const identityHash = createHash('sha256').update(`${issuer}\0${subject}`).digest('hex');
  return `${identityHash}@users.exode.invalid`;
}

function needsProfileUpdate(user: IUser, identity: ExodeIdentity, email: string): boolean {
  return (
    user.name !== identity.name ||
    user.avatar !== identity.avatar ||
    user.email !== email ||
    user.emailVerified !== true ||
    user.provider !== 'exode'
  );
}

export async function upsertExodeUser(
  identity: ExodeIdentity,
  issuer: string,
  tenantId: string | undefined,
  deps: ExodeUserDeps,
): Promise<IUser> {
  const normalizedIssuer = normalizeOpenIdIssuer(issuer);
  if (!normalizedIssuer) {
    throw new ExodeExchangeError('INTERNAL_ERROR', 500, 'Exode issuer is not configured');
  }

  const criteria: FilterQuery<IUser> = {
    openidId: identity.subject,
    openidIssuer: normalizedIssuer,
    ...(tenantId ? { tenantId } : {}),
  };
  const email = getTechnicalEmail(identity.subject, normalizedIssuer);
  const existing = await deps.findUser(criteria);

  if (existing && !needsProfileUpdate(existing, identity, email)) {
    return existing;
  }
  if (existing) {
    const updated = await deps.updateUser(String(existing._id), {
      name: identity.name,
      avatar: identity.avatar,
      email,
      emailVerified: true,
      provider: 'exode',
    });
    if (!updated) {
      throw new ExodeExchangeError('INTERNAL_ERROR', 500, 'Failed to update Exode user');
    }
    return updated;
  }

  try {
    await deps.createUser(
      {
        ...criteria,
        email,
        name: identity.name,
        avatar: identity.avatar,
        emailVerified: true,
        provider: 'exode',
        role: SystemRoles.USER,
      },
      deps.balanceConfig,
      true,
      false,
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  const created = await deps.findUser(criteria);
  if (!created) {
    throw new ExodeExchangeError('IDENTITY_CONFLICT', 409, 'Exode identity conflicts with a user');
  }
  return created;
}

export function serializeExodeUser(user: IUser): ExodeExchangeUser {
  const id = String(user._id);
  return {
    id,
    username: user.username ?? '',
    email: user.email,
    name: user.name ?? '',
    avatar: user.avatar ?? '',
    role: user.role ?? SystemRoles.USER,
    provider: user.provider,
    tenantId: user.tenantId,
    plugins: user.plugins,
    twoFactorEnabled: user.twoFactorEnabled,
    personalization: user.personalization,
    createdAt: user.createdAt?.toISOString() ?? '',
    updatedAt: user.updatedAt?.toISOString() ?? '',
  };
}
