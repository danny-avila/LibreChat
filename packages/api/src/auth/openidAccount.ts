import { SystemRoles } from 'librechat-data-provider';
import type { IUser, AppConfig, UserMethods, BalanceConfig } from '@librechat/data-schemas';
import { findOpenIDUser, getOpenIdEmail, normalizeOpenIdIssuer } from './openid';
import { getBalanceConfig } from '~/app/config';
import { isEmailDomainAllowed } from './domain';

export type OpenIdAccountClaims = {
  sub?: unknown;
  oid?: unknown;
  email?: unknown;
  preferred_username?: unknown;
  upn?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  username?: unknown;
  email_verified?: unknown;
  exp?: unknown;
  scope?: unknown;
  scp?: unknown;
  [claim: string]: unknown;
};

export type OpenIdAccountProfile = OpenIdAccountClaims;

export type OpenIdAccountOptions = {
  allowUserCreation: boolean;
  syncProfileOnCreate: boolean;
  syncProfileForExisting: boolean;
};

export type OpenIdAccountMethods = {
  findUser: UserMethods['findUser'];
  createUser: UserMethods['createUser'];
  updateUser: UserMethods['updateUser'];
};

export type OpenIdAccountInput = {
  claims: OpenIdAccountClaims;
  profile?: OpenIdAccountProfile;
  issuer?: string;
  tenantId?: string;
  appConfig: AppConfig;
  options: OpenIdAccountOptions;
  methods: OpenIdAccountMethods;
};

export type NormalizedOpenIdProfile = {
  subject: string;
  issuer?: string;
  idOnTheSource?: string;
  email?: string;
  username?: string;
  name?: string;
  emailVerified: boolean;
};

export type OpenIdRejectReason =
  | 'missing_sub'
  | 'missing_email'
  | 'email_domain_not_allowed'
  | 'existing_users_only'
  | 'provider_collision'
  | 'openid_subject_mismatch'
  | 'openid_issuer_mismatch'
  | 'duplicate_conflict';

export type OpenIdFailureReason = 'create_failed' | 'update_failed' | 'unexpected_error';

export type OpenIdAccountResult =
  | { status: 'resolved'; user: IUser; created: boolean }
  | { status: 'unauthorized'; reason: OpenIdRejectReason; message?: string }
  | { status: 'failed'; reason: OpenIdFailureReason; message?: string; error?: Error };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getFullName(profile: OpenIdAccountProfile): string | undefined {
  const configuredNameClaim = process.env.OPENID_NAME_CLAIM?.trim();
  if (configuredNameClaim) {
    const configuredName = stringValue(profile[configuredNameClaim]);
    if (configuredName) return configuredName;
  }

  const givenName = stringValue(profile.given_name);
  const familyName = stringValue(profile.family_name);
  if (givenName && familyName) return `${givenName} ${familyName}`;
  if (givenName) return givenName;
  if (familyName) return familyName;

  return stringValue(profile.username) ?? stringValue(profile.email);
}

function normalizeEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  return EMAIL_PATTERN.test(normalized) ? normalized : undefined;
}

export function normalizeOpenIdProfile({
  claims,
  profile,
  issuer,
}: {
  claims: OpenIdAccountClaims;
  profile?: OpenIdAccountProfile;
  issuer?: string;
}): NormalizedOpenIdProfile {
  const merged = { ...claims, ...(profile ?? {}) };
  const email = normalizeEmail(getOpenIdEmail(merged, 'openidAccount'));
  const configuredUsernameClaim = process.env.OPENID_USERNAME_CLAIM?.trim();
  const username =
    (configuredUsernameClaim ? stringValue(merged[configuredUsernameClaim]) : undefined) ??
    stringValue(merged.preferred_username) ??
    stringValue(merged.username) ??
    email;

  return {
    subject: stringValue(merged.sub) ?? '',
    issuer: normalizeOpenIdIssuer(issuer),
    idOnTheSource: stringValue(merged.oid),
    email,
    username,
    name: getFullName(merged),
    emailVerified: merged.email_verified === true,
  };
}

function toRequestUser(user: Partial<IUser>, fallback?: Partial<IUser>): IUser | null {
  const userId = user._id?.toString() ?? (typeof user.id === 'string' ? user.id : undefined);
  const email = user.email ?? fallback?.email;
  const provider = user.provider ?? fallback?.provider;
  const openidId = user.openidId ?? fallback?.openidId;

  if (!userId || !email || !provider || !openidId) {
    return null;
  }

  return {
    ...fallback,
    ...user,
    _id: user._id ?? fallback?._id,
    id: user.id ?? userId,
    email,
    provider,
    openidId,
    emailVerified: user.emailVerified ?? fallback?.emailVerified ?? false,
  } as IUser;
}

function buildUpdateData(
  user: IUser,
  profile: NormalizedOpenIdProfile,
  syncProfile: boolean,
): Partial<IUser> {
  const securityUpdate: Partial<IUser> = {
    provider: 'openid',
    openidId: profile.subject,
    ...(profile.issuer ? { openidIssuer: profile.issuer } : {}),
    ...(profile.idOnTheSource ? { idOnTheSource: profile.idOnTheSource } : {}),
    ...(!user.role ? { role: SystemRoles.USER } : {}),
  };

  if (!syncProfile) return securityUpdate;

  return {
    ...securityUpdate,
    ...(profile.email ? { email: profile.email, emailVerified: profile.emailVerified } : {}),
    ...(profile.username ? { username: profile.username } : {}),
    ...(profile.name ? { name: profile.name } : {}),
  };
}

function canUseProfileEmail(input: OpenIdAccountInput, profile: NormalizedOpenIdProfile): boolean {
  return Boolean(
    profile.email &&
      isEmailDomainAllowed(profile.email, input.appConfig.registration?.allowedDomains),
  );
}

function getEmailSafeProfile(
  input: OpenIdAccountInput,
  profile: NormalizedOpenIdProfile,
): NormalizedOpenIdProfile {
  return canUseProfileEmail(input, profile) ? profile : { ...profile, email: undefined };
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) {
    return false;
  }
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
  return code === 11000;
}

function isAcceptedDuplicateUser(user: IUser, profile: NormalizedOpenIdProfile): boolean {
  const userIssuer = normalizeOpenIdIssuer(user.openidIssuer);
  const issuerMatches = !profile.issuer || !userIssuer || userIssuer === profile.issuer;

  if (user.openidId === profile.subject && issuerMatches) {
    return true;
  }

  return (
    user.email === profile.email &&
    !user.openidId &&
    (!user.provider || user.provider === 'openid') &&
    issuerMatches
  );
}

function violatesProvisioningTenantScope(input: OpenIdAccountInput, user: IUser): boolean {
  if (input.tenantId) {
    return user.tenantId !== input.tenantId;
  }

  return false;
}

function shouldDeferExistingTenantUserMutation(input: OpenIdAccountInput, user: IUser): boolean {
  return !input.tenantId && Boolean(user.tenantId);
}

function getScopedFindUser(input: OpenIdAccountInput): UserMethods['findUser'] {
  if (!input.tenantId) {
    return input.methods.findUser;
  }

  return ((query: Parameters<UserMethods['findUser']>[0]) =>
    input.methods.findUser({
      ...query,
      tenantId: input.tenantId,
    })) as UserMethods['findUser'];
}

async function persistExistingUser(
  user: IUser,
  profile: NormalizedOpenIdProfile,
  methods: OpenIdAccountMethods,
  syncProfile: boolean,
): Promise<OpenIdAccountResult> {
  const updateData = buildUpdateData(user, profile, syncProfile);
  const updated = await methods.updateUser(user._id.toString(), updateData);
  if (!updated) {
    return { status: 'failed', reason: 'update_failed' };
  }

  const requestUser = toRequestUser(updated, { ...user, ...updateData });
  if (!requestUser) {
    return { status: 'failed', reason: 'update_failed' };
  }

  return { status: 'resolved', user: requestUser, created: false };
}

async function resolveDuplicateUser(
  input: OpenIdAccountInput,
  profile: NormalizedOpenIdProfile,
): Promise<OpenIdAccountResult> {
  const { methods } = input;
  const result = await findOpenIDUser({
    findUser: getScopedFindUser(input),
    email: profile.email,
    openidId: profile.subject,
    openidIssuer: profile.issuer,
    idOnTheSource: profile.idOnTheSource,
    strategyName: 'openidAccount',
  });

  if (!result.user || !isAcceptedDuplicateUser(result.user, profile)) {
    return { status: 'unauthorized', reason: 'duplicate_conflict' };
  }

  if (violatesProvisioningTenantScope(input, result.user)) {
    return { status: 'unauthorized', reason: 'duplicate_conflict' };
  }

  return persistExistingUser(result.user, profile, methods, input.options.syncProfileForExisting);
}

async function provisionOpenIdUser(
  input: OpenIdAccountInput,
  profile: NormalizedOpenIdProfile,
): Promise<OpenIdAccountResult> {
  if (!input.options.allowUserCreation) {
    return { status: 'unauthorized', reason: 'existing_users_only' };
  }
  if (!profile.email) {
    return { status: 'unauthorized', reason: 'missing_email' };
  }
  if (!canUseProfileEmail(input, profile)) {
    return { status: 'unauthorized', reason: 'email_domain_not_allowed' };
  }

  const createData = {
    provider: 'openid',
    openidId: profile.subject,
    email: profile.email,
    role: SystemRoles.USER,
    ...(profile.issuer ? { openidIssuer: profile.issuer } : {}),
    ...(profile.idOnTheSource ? { idOnTheSource: profile.idOnTheSource } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    ...(input.options.syncProfileOnCreate && profile.username
      ? { username: profile.username }
      : {}),
    ...(input.options.syncProfileOnCreate && profile.name ? { name: profile.name } : {}),
    ...(input.options.syncProfileOnCreate ? { emailVerified: profile.emailVerified } : {}),
  };
  const balanceConfig = getBalanceConfig(input.appConfig) as BalanceConfig | null;

  try {
    const created = await input.methods.createUser(
      createData,
      balanceConfig ?? undefined,
      true,
      true,
    );
    const requestUser = toRequestUser(created as Partial<IUser>, createData);
    if (!requestUser) {
      const reread = await input.methods.findUser({
        openidId: profile.subject,
        ...(profile.issuer ? { openidIssuer: profile.issuer } : {}),
        ...(input.tenantId ? { tenantId: input.tenantId } : { tenantId: { $exists: false } }),
      });
      const rereadUser = reread ? toRequestUser(reread, createData) : null;
      if (!rereadUser) {
        return { status: 'failed', reason: 'create_failed' };
      }
      return { status: 'resolved', user: rereadUser, created: true };
    }
    return { status: 'resolved', user: requestUser, created: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return resolveDuplicateUser(input, profile);
    }
    return {
      status: 'failed',
      reason: 'create_failed',
      error: error instanceof Error ? error : undefined,
    };
  }
}

export async function resolveOpenIdAccount(
  input: OpenIdAccountInput,
): Promise<OpenIdAccountResult> {
  try {
    const profile = normalizeOpenIdProfile(input);
    if (!profile.subject) return { status: 'unauthorized', reason: 'missing_sub' };
    const findUser = getScopedFindUser(input);

    const result = await findOpenIDUser({
      findUser,
      email: undefined,
      openidId: profile.subject,
      openidIssuer: profile.issuer,
      idOnTheSource: profile.idOnTheSource,
      strategyName: 'openidAccount',
    });

    if (result.error) {
      let reason: OpenIdRejectReason = 'openid_issuer_mismatch';
      if (!result.user) reason = 'provider_collision';
      if (result.user?.openidId && result.user.openidId !== profile.subject) {
        reason = 'openid_subject_mismatch';
      }
      return { status: 'unauthorized', reason, message: result.error };
    }

    let resolvedUser = result.user;
    if (!resolvedUser) {
      if (!profile.email) return { status: 'unauthorized', reason: 'missing_email' };
      if (!canUseProfileEmail(input, profile)) {
        return { status: 'unauthorized', reason: 'email_domain_not_allowed' };
      }

      const emailResult = await findOpenIDUser({
        findUser,
        email: profile.email,
        openidId: profile.subject,
        openidIssuer: profile.issuer,
        idOnTheSource: undefined,
        strategyName: 'openidAccount',
      });

      if (emailResult.error) {
        let reason: OpenIdRejectReason = 'openid_issuer_mismatch';
        if (!emailResult.user) reason = 'provider_collision';
        if (emailResult.user?.openidId && emailResult.user.openidId !== profile.subject) {
          reason = 'openid_subject_mismatch';
        }
        return { status: 'unauthorized', reason, message: emailResult.error };
      }

      if (!emailResult.user) {
        return await provisionOpenIdUser(input, profile);
      }

      resolvedUser = emailResult.user;
    }

    if (violatesProvisioningTenantScope(input, resolvedUser)) {
      return { status: 'unauthorized', reason: 'duplicate_conflict' };
    }

    if (shouldDeferExistingTenantUserMutation(input, resolvedUser)) {
      return { status: 'resolved', user: resolvedUser, created: false };
    }

    const updateProfile = getEmailSafeProfile(input, profile);
    return await persistExistingUser(
      resolvedUser,
      updateProfile,
      input.methods,
      input.options.syncProfileForExisting,
    );
  } catch (error) {
    return {
      status: 'failed',
      reason: 'unexpected_error',
      error: error instanceof Error ? error : undefined,
    };
  }
}
