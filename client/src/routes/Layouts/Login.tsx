import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { useAuthContext } from '~/hooks/AuthContext';
import { useIsExodeEmbed } from '~/components/Exode';
import StartupLayout from './Startup';
import store from '~/store';

export default function LoginLayout() {
  const { isAuthenticated } = useAuthContext();
  const isExodeEmbed = useIsExodeEmbed();
  const [queriesEnabled, setQueriesEnabled] = useRecoilState<boolean>(store.queriesEnabled);
  useEffect(() => {
    if (queriesEnabled) {
      return;
    }
    const timeout: NodeJS.Timeout = setTimeout(() => {
      setQueriesEnabled(true);
    }, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, [queriesEnabled, setQueriesEnabled]);
  /**
   * The exode embed never shows credential UI.
   *
   * Its session comes from the host's one-shot bootstrap token (`ExodeBridge`), so a login or
   * register form here is always wrong: the user is already signed in to exode, and LibreChat's
   * own accounts are provisioned for them. Reaching this route means the exchange failed —
   * rendering the form would invite them to create a second, unlinked account. Show nothing and
   * let the host surface the error it was posted.
   */
  if (isExodeEmbed && !isAuthenticated) {
    return null;
  }

  return <StartupLayout isAuthenticated={isAuthenticated} />;
}
