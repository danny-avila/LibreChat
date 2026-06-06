import { TranslationKeys } from '~/hooks';

const getLoginError = (errorText: string): TranslationKeys => {
  const defaultError: TranslationKeys = 'com_auth_error_login';

  if (!errorText) {
    return defaultError;
  }

  console.log('errortext:',errorText)
  switch (true) {
    case errorText.includes('ERR_ADMIN_VERIFICATION_PENDING'):
      return 'com_auth_error_login_admin_verfication';
    case errorText.includes('409'):
      return 'com_auth_error_login_single_device';
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
