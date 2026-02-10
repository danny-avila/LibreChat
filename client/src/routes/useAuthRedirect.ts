import { useAuthContext } from '~/hooks';

export default function useAuthRedirect() {
  const { user, roles, isAuthenticated } = useAuthContext();

  // No redirect — unauthenticated users can view the UI.
  // Auth is enforced at the submission layer (AuthGateDialog).

  return {
    user,
    roles,
    isAuthenticated,
  };
}
