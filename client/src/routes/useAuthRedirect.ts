import { useAuthContext } from '~/hooks';

export default function useAuthRedirect() {
  const { user } = useAuthContext();

  return {
    user,
    // In public mode, always consider the user as authenticated for UI rendering
    isAuthenticated: true,
  };
}
