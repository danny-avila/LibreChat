import { useEffect } from 'react';
import { useGetStartupConfig } from '~/data-provider';

/**
 * ThemeProvider component that applies custom themes based on configuration
 * This component should be placed high in the component tree to ensure
 * theme classes are applied to the document body
 */
export function PfizerThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: startupConfig } = useGetStartupConfig();

  useEffect(() => {
    // Remove any existing theme classes
    document.body.classList.remove('pfizer');

    // Apply theme based on configuration
    const isPfizerEnabled = startupConfig?.pfizerThemeEnabled === true;

    if (isPfizerEnabled) {
      const root = document.getElementById('root');
      root?.classList.add('pfizer');
    }
  }, [startupConfig]);

  return <>{children}</>;
}

export default PfizerThemeProvider;