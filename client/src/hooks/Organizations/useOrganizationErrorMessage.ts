import { useCallback } from 'react';
import { OrganizationErrorCode } from 'librechat-data-provider';
import type { TOrganizationErrorCode } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import useLocalize from '~/hooks/useLocalize';

const ORGANIZATION_ERROR_KEYS: Record<TOrganizationErrorCode, TranslationKeys> = {
  [OrganizationErrorCode.ORGANIZATIONS_DISABLED]: 'com_error_org_ORGANIZATIONS_DISABLED',
  [OrganizationErrorCode.ORG_CREATE_DISABLED]: 'com_error_org_ORG_CREATE_DISABLED',
  [OrganizationErrorCode.ORG_LIMIT_REACHED]: 'com_error_org_ORG_LIMIT_REACHED',
  [OrganizationErrorCode.ORG_NAME_INVALID]: 'com_error_org_ORG_NAME_INVALID',
  [OrganizationErrorCode.EMAIL_NOT_VERIFIED]: 'com_error_org_EMAIL_NOT_VERIFIED',
  [OrganizationErrorCode.NOT_A_MEMBER]: 'com_error_org_NOT_A_MEMBER',
  [OrganizationErrorCode.MEMBERSHIP_INACTIVE]: 'com_error_org_MEMBERSHIP_INACTIVE',
  [OrganizationErrorCode.MEMBER_NOT_FOUND]: 'com_error_org_MEMBER_NOT_FOUND',
  [OrganizationErrorCode.ROLE_NOT_FOUND]: 'com_error_org_ROLE_NOT_FOUND',
  [OrganizationErrorCode.ROLE_NOT_ASSIGNABLE]: 'com_error_org_ROLE_NOT_ASSIGNABLE',
  [OrganizationErrorCode.LAST_ADMIN]: 'com_error_org_LAST_ADMIN',
  [OrganizationErrorCode.INVITE_INVALID]: 'com_error_org_INVITE_INVALID',
  [OrganizationErrorCode.INVITE_NOT_FOUND]: 'com_error_org_INVITE_NOT_FOUND',
  [OrganizationErrorCode.INVITE_EXPIRED]: 'com_error_org_INVITE_EXPIRED',
  [OrganizationErrorCode.INVITE_EXHAUSTED]: 'com_error_org_INVITE_EXHAUSTED',
  [OrganizationErrorCode.INVITE_EMAIL_MISMATCH]: 'com_error_org_INVITE_EMAIL_MISMATCH',
  [OrganizationErrorCode.LINK_INVITES_DISABLED]: 'com_error_org_LINK_INVITES_DISABLED',
  [OrganizationErrorCode.ORGANIZATION_CHANGED]: 'com_error_org_ORGANIZATION_CHANGED',
  [OrganizationErrorCode.ORGANIZATION_SUSPENDED]: 'com_error_org_ORGANIZATION_SUSPENDED',
};

/** The stable organization error code a failed request carries, if any. */
export function getOrganizationErrorCode(error: unknown): TOrganizationErrorCode | undefined {
  const code = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data?.code;
  return typeof code === 'string' && code in ORGANIZATION_ERROR_KEYS
    ? (code as TOrganizationErrorCode)
    : undefined;
}

/** Localized, actionable copy for a failed organization request. */
export default function useOrganizationErrorMessage(): (error: unknown) => string {
  const localize = useLocalize();
  return useCallback(
    (error: unknown) => {
      const code = getOrganizationErrorCode(error);
      return localize(code ? ORGANIZATION_ERROR_KEYS[code] : 'com_error_org_generic');
    },
    [localize],
  );
}
