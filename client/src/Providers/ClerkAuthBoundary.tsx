import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loginPage } from 'librechat-data-provider';
import { ClerkProvider, useAuth, useClerk } from '@clerk/react';
import type { TStartupConfig } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { ClerkSessionProvider } from '~/hooks/AuthContext';
import { getClerkLocalization } from './clerkLocalization';
import { useGetStartupConfig } from '~/data-provider';

type ClerkMode = { enabled: false } | { enabled: true; publishableKey: string };

function getLiveClerkMode(config?: TStartupConfig): ClerkMode | undefined {
  if (!config) {
    return undefined;
  }
  if (config.clerkLoginEnabled !== true) {
    return { enabled: false };
  }
  if (typeof config.clerkPublishableKey !== 'string' || config.clerkPublishableKey.trim() === '') {
    return { enabled: false };
  }
  return { enabled: true, publishableKey: config.clerkPublishableKey };
}

function isLatchable(config?: TStartupConfig) {
  return (
    config != null &&
    (config.clerkLoginEnabled !== true ||
      (typeof config.clerkPublishableKey === 'string' && config.clerkPublishableKey.trim() !== ''))
  );
}

function ClerkSessionBridge({ children }: { children: ReactNode }) {
  const { sessionId } = useAuth();
  const { signOut } = useClerk();
  const value = useMemo(
    () => ({
      sessionId: sessionId ?? null,
      signOut: (options: { sessionId: string }) => signOut(options),
    }),
    [sessionId, signOut],
  );

  return <ClerkSessionProvider value={value}>{children}</ClerkSessionProvider>;
}

export default function ClerkAuthBoundary({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useGetStartupConfig();
  const { i18n, t } = useTranslation();
  const [latchedMode, setLatchedMode] = useState<ClerkMode>();
  const liveMode = getLiveClerkMode(data);

  useEffect(() => {
    if (latchedMode || !isLatchable(data) || !liveMode) {
      return;
    }
    setLatchedMode(liveMode);
  }, [data, latchedMode, liveMode]);

  const mode = latchedMode ?? liveMode;

  if (!mode && isError) {
    return <ClerkSessionProvider>{children}</ClerkSessionProvider>;
  }
  if (!mode && isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center"
      >
        {t('com_auth_clerk_loading')}
      </div>
    );
  }
  if (!mode || !mode.enabled) {
    return <ClerkSessionProvider>{children}</ClerkSessionProvider>;
  }

  return (
    <ClerkProvider
      publishableKey={mode.publishableKey}
      signInUrl={loginPage()}
      localization={getClerkLocalization(i18n.resolvedLanguage)}
    >
      <ClerkSessionBridge>{children}</ClerkSessionBridge>
    </ClerkProvider>
  );
}
