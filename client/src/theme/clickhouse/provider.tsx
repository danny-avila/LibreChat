import React, { useEffect, useState } from 'react';
import { ClickUIProvider } from '@clickhouse/click-ui';
// cui.css is not in the package exports map; use the direct dist path
import '@clickhouse/click-ui/dist/esm/click-ui.css';
import './variables.css';

type CuiTheme = 'dark' | 'light';

const getTheme = (): CuiTheme =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light';

export function CHCThemeProvider({ children }: { children: React.ReactNode }) {
  const [cuiTheme, setCuiTheme] = useState<CuiTheme>(getTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setCuiTheme(getTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <ClickUIProvider theme={cuiTheme} persistTheme={false}>
      {children}
    </ClickUIProvider>
  );
}

export default CHCThemeProvider;
