import type { IUser } from '@librechat/data-schemas';

/**
 * Supported IUser fields that can be used as the Langfuse trace userId.
 * These are non-sensitive, string-valued fields available on the user object.
 */
const SUPPORTED_FIELDS = ['id', 'email', 'username', 'name'] as const;
type SupportedField = (typeof SUPPORTED_FIELDS)[number];

function isSupportedField(value: string): value is SupportedField {
  return (SUPPORTED_FIELDS as readonly string[]).includes(value);
}

/**
 * Returns the Langfuse trace userId for the given user, controlled by the
 * LANGFUSE_USER_ID_FIELD environment variable.
 *
 * Defaults to the internal MongoDB id ('id') when the env var is unset or
 * set to an unsupported value, preserving the existing behaviour.
 *
 * Supported values: 'id' | 'email' | 'username' | 'name'
 */
export function getLangfuseUserId(user: IUser | null | undefined): string | undefined {
  if (!user) {
    return undefined;
  }

  const configured = process.env.LANGFUSE_USER_ID_FIELD?.trim();
  const field: SupportedField =
    configured && isSupportedField(configured) ? configured : 'id';

  const value = user[field];
  return typeof value === 'string' && value.length > 0 ? value : user.id;
}
