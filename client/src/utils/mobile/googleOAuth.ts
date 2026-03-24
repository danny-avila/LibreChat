import { GenericOAuth2 } from '@capacitor-community/generic-oauth2';

export async function authenticateWithGoogleIOS() {
  const appId = (import.meta.env as ImportMetaEnv & { VITE_GOOGLE_IOS_CLIENT_ID?: string })
    .VITE_GOOGLE_IOS_CLIENT_ID;

  if (!appId) {
    throw new Error('Missing VITE_GOOGLE_IOS_CLIENT_ID');
  }

  return await GenericOAuth2.authenticate({
    authorizationBaseUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    accessTokenEndpoint: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    responseType: 'code',
    pkceEnabled: true,
    logsEnabled: import.meta.env.DEV,
    ios: {
      appId,
      responseType: 'code',
      redirectUrl: 'ai.librechat.app:/oauth2redirect/google',
    },
  });
}
