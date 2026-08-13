import type { IUser } from '@librechat/data-schemas';

const publicUserResponseFields = [
  '_id',
  'id',
  'name',
  'username',
  'email',
  'emailVerified',
  'avatar',
  'provider',
  'role',
  'plugins',
  'twoFactorEnabled',
  'termsAccepted',
  'personalization',
  'favorites',
  'skillStates',
  'createdAt',
  'updatedAt',
  'tenantId',
] as const satisfies readonly (keyof IUser)[];

type PublicUserResponseField = (typeof publicUserResponseFields)[number];

export type UserResponse = Partial<Pick<IUser, PublicUserResponseField>>;

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function getUserSource(user: IUser): Record<string, unknown> {
  const candidate = user as unknown as { toObject?: () => unknown };
  if (typeof candidate.toObject === 'function') {
    return toRecord(candidate.toObject());
  }

  return toRecord(user);
}

export function serializeUserForResponse(user: IUser): UserResponse {
  const source = getUserSource(user);
  const entries = publicUserResponseFields
    .map((field) => [field, source[field]] as const)
    .filter((entry) => entry[1] !== undefined);

  return Object.fromEntries(entries) as UserResponse;
}
