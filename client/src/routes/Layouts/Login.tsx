import { useAuthContext } from '~/hooks/AuthContext';
import StartupLayout from './Startup';

export default function LoginLayout() {
  const { isAuthenticated } = useAuthContext();
  return <StartupLayout isAuthenticated={isAuthenticated} />;
}
