import { useNavigate } from 'react-router-dom';
import React, { useEffect } from 'react';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { SignUp, useAuth } from '@clerk/clerk-react';
import { ThemeSelector } from '~/components/ui';
import { useDarkMode } from '~/hooks/useDarkMode';
import { dark } from '@clerk/themes';
import { useAuthContext } from '~/hooks/AuthContext';

const Registration: React.FC = () => {
  const navigate = useNavigate();
  const { data: startupConfig } = useGetStartupConfig();
  const isDarkMode = useDarkMode();
  const { error, isAuthenticated } = useAuthContext();

  useEffect(() => {
    if (startupConfig?.registrationEnabled === false) {
      navigate('/login', { replace: true });
    }
  }, [startupConfig, navigate]);

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
      <SignUp
        appearance={{
          baseTheme: isDarkMode ? dark : undefined,
        }}
        signInUrl="/login"
      />
    </div>
  );
};

export default Registration;
