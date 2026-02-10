import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { useAuthContext } from '~/hooks/AuthContext';
import StartupLayout from './Startup';
import store from '~/store';

export default function LoginLayout() {
  const { isAuthenticated } = useAuthContext();
  const [queriesEnabled, setQueriesEnabled] = useRecoilState<boolean>(store.queriesEnabled);
  useEffect(() => {
    if (queriesEnabled || !isAuthenticated) {
      return;
    }
    const timeout: NodeJS.Timeout = setTimeout(() => {
      setQueriesEnabled(true);
    }, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, [queriesEnabled, setQueriesEnabled, isAuthenticated]);
  return <StartupLayout isAuthenticated={isAuthenticated} />;
}
