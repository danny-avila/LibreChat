import {
  ErrorTypes,
  OrganizationErrorCode,
  TWO_FACTOR_FEDERATED_LOGIN_BLOCKED_CODE,
} from 'librechat-data-provider';
import { TranslationKeys } from '~/hooks';

const getLoginError = (errorText: string): TranslationKeys => {
  const defaultError: TranslationKeys = 'com_auth_error_login';

  if (!errorText) {
    return defaultError;
  }

  switch (true) {
    case errorText === ErrorTypes.AUTH_CROSS_ORIGIN:
      return 'com_auth_error_login_cross_origin';
    /** Must precede the status cases: this is also a 403, but it is not a ban. */
    case errorText.includes(TWO_FACTOR_FEDERATED_LOGIN_BLOCKED_CODE):
      return 'com_auth_error_login_federated_two_factor';
    /** Also a 403: every organization the account belongs to is suspended. */
    case errorText === OrganizationErrorCode.ORGANIZATION_SUSPENDED:
      return 'com_error_org_ORGANIZATION_SUSPENDED';
    case errorText.includes('429'):
      return 'com_auth_error_login_rl';
    case errorText.includes('403'):
      return 'com_auth_error_login_ban';
    case errorText.includes('500'):
      return 'com_auth_error_login_server';
    case errorText.includes('422'):
      return 'com_auth_error_login_unverified';
    default:
      return defaultError;
  }
};

export default getLoginError;
