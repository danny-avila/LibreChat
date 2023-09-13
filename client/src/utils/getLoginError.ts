const getLoginError = (errorText: string) => {
  const defaultError = 'com_auth_error_login';
  if (!errorText) {
    return defaultError;
  }

  if (errorText?.includes('429')) {
    return 'com_auth_error_login_rl';
  } else if (errorText?.includes('403')) {
    return 'com_auth_error_login_ban';
  } else if (errorText?.includes('500')) {
    return 'com_auth_error_login_server';
  } else {
    return defaultError;
  }
};

export default getLoginError;
