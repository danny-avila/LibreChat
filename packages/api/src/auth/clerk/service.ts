import type {
  AppConfig,
  IUser,
  LinkClerkIdentityInput,
  LinkClerkIdentityResult,
} from '@librechat/data-schemas';
import type { ClerkIdentityConvergence } from '../../app/metrics';
import type { VerifiedClerkIdentity } from './verify';
import { recordClerkIdentityResolution } from '../../app/metrics';

export type { LinkClerkIdentityInput, LinkClerkIdentityResult } from '@librechat/data-schemas';

export type ClerkTenantScope = { tenantId: string } | { tenantId: { $exists: false } };

export type ClerkUserSearchCriteria = ClerkTenantScope & ({ clerkId: string } | { email: string });

export interface CreateSocialUserInput {
  email: string;
  emailVerified: true;
  avatarUrl?: string;
  provider: 'clerk';
  providerKey: 'clerkId';
  providerId: string;
  username?: string;
  name?: string;
  appConfig: AppConfig;
}

export interface ClerkIdentityServiceDependencies {
  findUser: (
    searchCriteria: ClerkUserSearchCriteria,
    fieldsToSelect: '+clerkDeletedAt',
  ) => Promise<IUser | null>;
  linkClerkIdentity: (input: LinkClerkIdentityInput) => Promise<LinkClerkIdentityResult>;
  createSocialUser: (input: CreateSocialUserInput) => Promise<IUser | null>;
}

export interface ResolveClerkIdentityInput {
  identity: VerifiedClerkIdentity;
  tenantId?: string;
  userByClerkId: IUser | null;
  userByEmail: IUser | null | undefined;
  appConfig: AppConfig;
}

export type ResolveClerkIdentityResult =
  | { status: 'authenticated'; user: IUser }
  | { status: 'linked'; user: IUser }
  | { status: 'already_linked'; user: IUser }
  | { status: 'created'; user: IUser }
  | { status: 'conflict' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

function recordResolution(
  result: ResolveClerkIdentityResult,
  convergence: ClerkIdentityConvergence = 'none',
): ResolveClerkIdentityResult {
  recordClerkIdentityResolution(result.status, convergence);
  return result;
}

function getTenantScope(tenantId: string | undefined): ClerkTenantScope {
  return tenantId ? { tenantId } : { tenantId: { $exists: false } };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function isTombstoned(user: IUser): boolean {
  return user.clerkDeletedAt != null;
}

function mapLinkResult(result: LinkClerkIdentityResult): ResolveClerkIdentityResult {
  switch (result.status) {
    case 'linked':
    case 'already_linked':
      return { status: result.status, user: result.user };
    case 'conflict':
    case 'not_found':
      return { status: result.status };
  }
}

async function resolveEmailCandidate(
  input: ResolveClerkIdentityInput,
  userByEmail: IUser,
  deps: ClerkIdentityServiceDependencies,
): Promise<ResolveClerkIdentityResult> {
  if (isTombstoned(userByEmail)) {
    return { status: 'conflict' };
  }
  if (userByEmail.clerkId === input.identity.clerkId) {
    return { status: 'already_linked', user: userByEmail };
  }
  if (userByEmail.clerkId != null) {
    return { status: 'conflict' };
  }
  if (input.identity.emailVerified !== true) {
    return { status: 'forbidden' };
  }

  const linkResult = await deps.linkClerkIdentity({
    userId: userByEmail._id.toString(),
    clerkId: input.identity.clerkId,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
  return mapLinkResult(linkResult);
}

async function convergeDuplicateCreate(
  input: ResolveClerkIdentityInput & { identity: VerifiedClerkIdentity & { email: string } },
  deps: ClerkIdentityServiceDependencies,
): Promise<ResolveClerkIdentityResult> {
  const tenantScope = getTenantScope(input.tenantId);
  const userByClerkId = await deps.findUser(
    { clerkId: input.identity.clerkId, ...tenantScope },
    '+clerkDeletedAt',
  );
  if (userByClerkId) {
    return isTombstoned(userByClerkId)
      ? { status: 'forbidden' }
      : { status: 'already_linked', user: userByClerkId };
  }

  const userByEmail = await deps.findUser(
    { email: input.identity.email, ...tenantScope },
    '+clerkDeletedAt',
  );
  if (!userByEmail) {
    return { status: 'not_found' };
  }

  return resolveEmailCandidate(input, userByEmail, deps);
}

export async function resolveClerkIdentity(
  input: ResolveClerkIdentityInput,
  deps: ClerkIdentityServiceDependencies,
): Promise<ResolveClerkIdentityResult> {
  if (input.userByClerkId) {
    return recordResolution(
      isTombstoned(input.userByClerkId)
        ? { status: 'forbidden' }
        : { status: 'authenticated', user: input.userByClerkId },
    );
  }

  if (input.userByEmail) {
    return recordResolution(await resolveEmailCandidate(input, input.userByEmail, deps));
  }

  if (input.identity.emailVerified !== true || !input.identity.email) {
    return recordResolution({ status: 'forbidden' });
  }

  const verifiedInput = input as ResolveClerkIdentityInput & {
    identity: VerifiedClerkIdentity & { email: string };
  };
  try {
    const createdUser = await deps.createSocialUser({
      email: verifiedInput.identity.email,
      emailVerified: true,
      avatarUrl: verifiedInput.identity.avatarUrl,
      provider: 'clerk',
      providerKey: 'clerkId',
      providerId: verifiedInput.identity.clerkId,
      username: verifiedInput.identity.username,
      name: verifiedInput.identity.name,
      appConfig: verifiedInput.appConfig,
    });
    return recordResolution(
      createdUser ? { status: 'created', user: createdUser } : { status: 'not_found' },
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      recordClerkIdentityResolution('error', 'none');
      throw error;
    }
    return recordResolution(await convergeDuplicateCreate(verifiedInput, deps), 'create_duplicate');
  }
}
