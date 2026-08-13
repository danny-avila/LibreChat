import { useCallback, useEffect, useRef, useState } from 'react';
import { loginPage } from 'librechat-data-provider';
import { SignInButton, useAuth, useClerk } from '@clerk/react';
import type { ClerkAuthErrorCode } from 'librechat-data-provider';
import { getClerkAuthErrorCode } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';

type BridgeState =
  | { status: 'idle' }
  | { status: 'exchanging' }
  | { status: 'complete' }
  | { status: 'switching' }
  | {
      status: 'error';
      errorKey:
        | 'com_auth_clerk_error'
        | 'com_auth_clerk_token_error'
        | 'com_auth_clerk_sign_out_error';
      canSwitchAccount: boolean;
    };

type ActiveExchange = {
  generation: number;
  sessionId: string;
};

const tokenUnavailable = Symbol('clerk-token-unavailable');

function canSwitchForCode(code?: ClerkAuthErrorCode) {
  return code === 'CLERK_LOGIN_FORBIDDEN' || code === 'CLERK_IDENTITY_CONFLICT';
}

export default function ClerkLogin() {
  const localize = useLocalize();
  const { isLoaded, isSignedIn, sessionId, getToken } = useAuth();
  const { signOut } = useClerk();
  const { isAuthenticated, loginWithClerk } = useAuthContext();
  const [state, setState] = useState<BridgeState>({ status: 'idle' });
  const errorRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const attemptedSessionRef = useRef<string | null>(null);
  const failureCountRef = useRef(0);
  const activeExchangeRef = useRef<ActiveExchange | null>(null);
  const switchingRef = useRef(false);
  const currentSessionRef = useRef(sessionId);
  const authenticatedRef = useRef(isAuthenticated);

  currentSessionRef.current = sessionId;
  authenticatedRef.current = isAuthenticated;

  useEffect(
    () => () => {
      mountedRef.current = false;
      generationRef.current += 1;
    },
    [],
  );

  const isCurrent = useCallback((activeSessionId: string, generation: number) => {
    return (
      mountedRef.current &&
      currentSessionRef.current === activeSessionId &&
      authenticatedRef.current === false &&
      generationRef.current === generation
    );
  }, []);

  const runExchange = useCallback(
    async (activeSessionId: string) => {
      if (activeExchangeRef.current?.sessionId === activeSessionId) {
        return;
      }

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      activeExchangeRef.current = { generation, sessionId: activeSessionId };
      setState({ status: 'exchanging' });

      const exchangeToken = async (clerkToken: string) => {
        try {
          return await loginWithClerk(clerkToken);
        } catch (error) {
          failureCountRef.current += 1;
          throw error;
        }
      };

      try {
        const clerkToken = await getToken();
        if (!isCurrent(activeSessionId, generation)) {
          return;
        }
        if (clerkToken == null) {
          throw tokenUnavailable;
        }

        try {
          await exchangeToken(clerkToken);
        } catch (error) {
          if (getClerkAuthErrorCode(error) !== 'CLERK_TOKEN_REPLAYED') {
            throw error;
          }

          const freshToken = await getToken({ skipCache: true });
          if (!isCurrent(activeSessionId, generation)) {
            return;
          }
          if (freshToken == null) {
            throw tokenUnavailable;
          }
          await exchangeToken(freshToken);
        }

        if (isCurrent(activeSessionId, generation)) {
          setState({ status: 'complete' });
        }
      } catch (error) {
        if (!isCurrent(activeSessionId, generation)) {
          return;
        }
        const code = error === tokenUnavailable ? undefined : getClerkAuthErrorCode(error);
        setState({
          status: 'error',
          errorKey:
            error === tokenUnavailable ? 'com_auth_clerk_token_error' : 'com_auth_clerk_error',
          canSwitchAccount: canSwitchForCode(code) || failureCountRef.current >= 2,
        });
      } finally {
        if (activeExchangeRef.current?.generation === generation) {
          activeExchangeRef.current = null;
        }
      }
    },
    [getToken, isCurrent, loginWithClerk],
  );

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    if (!isSignedIn || !sessionId) {
      generationRef.current += 1;
      attemptedSessionRef.current = null;
      failureCountRef.current = 0;
      activeExchangeRef.current = null;
      switchingRef.current = false;
      setState({ status: 'idle' });
      return;
    }
    if (isAuthenticated) {
      generationRef.current += 1;
      return;
    }
    if (attemptedSessionRef.current === sessionId) {
      return;
    }

    attemptedSessionRef.current = sessionId;
    failureCountRef.current = 0;
    switchingRef.current = false;
    void runExchange(sessionId);
  }, [isAuthenticated, isLoaded, isSignedIn, runExchange, sessionId]);

  useEffect(() => {
    if (state.status === 'error') {
      errorRef.current?.focus();
    }
  }, [state.status]);

  const retry = useCallback(() => {
    if (!sessionId || activeExchangeRef.current) {
      return;
    }
    void runExchange(sessionId);
  }, [runExchange, sessionId]);

  const useAnotherAccount = useCallback(async () => {
    if (!sessionId || switchingRef.current) {
      return;
    }
    switchingRef.current = true;
    generationRef.current += 1;
    setState({ status: 'switching' });

    try {
      await signOut({ sessionId });
    } catch {
      if (mountedRef.current && currentSessionRef.current === sessionId) {
        switchingRef.current = false;
        setState({
          status: 'error',
          errorKey: 'com_auth_clerk_sign_out_error',
          canSwitchAccount: true,
        });
      }
    }
  }, [sessionId, signOut]);

  if (!isLoaded) {
    return (
      <p role="status" aria-live="polite" className="mt-2 text-center text-sm">
        {localize('com_auth_clerk_loading')}
      </p>
    );
  }

  if (!isSignedIn || !sessionId) {
    const returnUrl = loginPage();
    return (
      <div className="mt-2 flex gap-x-2">
        <SignInButton
          mode="modal"
          withSignUp={true}
          forceRedirectUrl={returnUrl}
          fallbackRedirectUrl={returnUrl}
          signUpForceRedirectUrl={returnUrl}
          signUpFallbackRedirectUrl={returnUrl}
        >
          <button
            type="button"
            data-testid="clerk-sign-in-button"
            className="flex w-full items-center justify-center rounded-2xl border border-border-light bg-surface-primary px-5 py-3 text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
          >
            {localize('com_auth_clerk_sign_in')}
          </button>
        </SignInButton>
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  if (state.status === 'error') {
    return (
      <div className="mt-3 space-y-2">
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="rounded-xl border border-red-500/20 bg-red-50/50 px-4 py-3 text-sm text-red-700 outline-none focus-visible:ring-2 focus-visible:ring-green-500 dark:bg-red-950/30 dark:text-red-100"
        >
          {localize(state.errorKey)}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-border-light px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-tertiary"
          >
            {localize('com_auth_clerk_retry')}
          </button>
          {state.canSwitchAccount && (
            <button
              type="button"
              onClick={useAnotherAccount}
              className="rounded-lg border border-border-light px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-tertiary"
            >
              {localize('com_auth_clerk_use_another_account')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <p
      role="status"
      aria-live="polite"
      aria-busy={state.status === 'exchanging' || state.status === 'switching'}
      className="mt-2 text-center text-sm text-text-secondary"
    >
      {localize(
        state.status === 'exchanging' || state.status === 'complete'
          ? 'com_auth_clerk_exchanging'
          : 'com_auth_clerk_loading',
      )}
    </p>
  );
}
