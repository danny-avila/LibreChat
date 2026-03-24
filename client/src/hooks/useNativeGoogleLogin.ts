import { dataService } from 'librechat-data-provider';
import { useState } from 'react';
import { useAuthContext } from './AuthContext';
import { isNativeIOS } from '~/utils/mobile/platform';

export default function useNativeGoogleLogin() {
  const { completeAuth, setError } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);

  const login = async () => {
    if (!isNativeIOS()) {
      return false;
    }

    setIsLoading(true);
    try {
      const { authenticateWithGoogleIOS } = await import('~/utils/mobile/googleOAuth');
      const response = await authenticateWithGoogleIOS();
      const idToken =
        response?.authentication?.idToken ??
        response?.idToken ??
        response?.accessTokenResponse?.id_token;

      if (!idToken) {
        throw new Error('Missing Google ID token');
      }

      const authResponse = await dataService.loginGoogleMobile({ idToken });
      completeAuth(authResponse);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed';
      setError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    login,
    isLoading,
  };
}
