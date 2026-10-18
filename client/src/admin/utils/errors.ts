import { AdminErrorCode, OrganizationErrorCode } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { AdminRequestError } from '~/admin/api/organizations';

/** Localized copy for the stable codes the operator's actions can fail with. */
const ERROR_KEYS: Record<string, string> = {
  [AdminErrorCode.OPERATOR_REQUIRED]: 'com_admin_error_OPERATOR_REQUIRED',
  [AdminErrorCode.ADMIN_SCOPE_INVALID]: 'com_admin_error_ADMIN_SCOPE_INVALID',
  [AdminErrorCode.ADMIN_SCOPE_UNSUPPORTED]: 'com_admin_error_ADMIN_SCOPE_UNSUPPORTED',
  [AdminErrorCode.ORGANIZATION_NOT_FOUND]: 'com_admin_error_ORGANIZATION_NOT_FOUND',
  [AdminErrorCode.CONFIRMATION_MISMATCH]: 'com_admin_error_CONFIRMATION_MISMATCH',
  [AdminErrorCode.ORGANIZATION_DELETING]: 'com_admin_error_ORGANIZATION_DELETING',
  [OrganizationErrorCode.ORG_NAME_INVALID]: 'com_error_org_ORG_NAME_INVALID',
};

/** The stable code an operator action failed with, if the server sent one. */
export function adminErrorCode(error: unknown): string | undefined {
  return error instanceof AdminRequestError ? error.code : undefined;
}

/**
 * What to tell the operator about a failed action. Only known codes get specific copy; anything
 * else reads as a generic failure, so upstream text never reaches the page.
 */
export function adminErrorMessage(error: unknown, localize: t.LocalizeFn): string {
  const code = adminErrorCode(error);
  const key = code ? ERROR_KEYS[code] : undefined;
  return localize(key ?? 'com_admin_error_generic');
}
