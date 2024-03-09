import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import { ThemeSelector } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { SignIn } from '@clerk/clerk-react';
import { useDarkMode } from '~/hooks/useDarkMode';
import { dark } from '@clerk/themes';

function Login() {
  const { error, isAuthenticated } = useAuthContext();
  const localize = useLocalize();
  const navigate = useNavigate();
  const isDarkMode = useDarkMode();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/c/new', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-white pt-6 dark:bg-gray-900 sm:pt-0">
      <div className="absolute bottom-0 left-0 right-0 top-0 m-auto">
        <ThemeSelector />
      </div>
      <SignIn
        appearance={{
          baseTheme: isDarkMode ? dark : undefined,
        }}
        signUpUrl="/register"
      />
    </div>
  );
}

export default Login;
