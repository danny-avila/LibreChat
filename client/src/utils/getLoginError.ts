const getLoginError = (errorText: string) => {
  const defaultError = 'com_auth_error_login';
  if (!errorText) {
    return defaultError;
  }

  console.log('errorText', errorText);
  if (errorText?.includes('429')) {
    return 'com_auth_error_rate_limit';
  } else if (errorText?.includes('403')) {
    return 'com_auth_error_login_ban';
  } else {
    return defaultError;
  }
};

export default getLoginError;
