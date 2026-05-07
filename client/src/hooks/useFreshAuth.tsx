/* eslint-disable i18next/no-literal-string */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@librechat/client';
import { useReauthMutation } from '~/data-provider/Admin';

/**
 * In-memory fresh-auth token state. Stored only in React state — never
 * persisted — so a refresh or new tab discards it. The token's `expiresAt`
 * comes back from the server (POST /api/admin/reauth, 5 minute TTL).
 */
type FreshAuthState = {
  token: string;
  expiresAt: number; // ms epoch
};

type DeferredAuth = {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
};

type FreshAuthContextValue = {
  /**
   * Returns a still-valid fresh-auth token, prompting the admin for their
   * password if one isn't cached. Rejects if the user cancels the prompt.
   */
  ensureFreshAuth: () => Promise<string>;
  /** Manually clear the cached token (e.g. on logout). */
  clearFreshAuth: () => void;
};

const FreshAuthContext = createContext<FreshAuthContextValue | undefined>(undefined);

const SAFETY_MARGIN_MS = 10 * 1000; // treat tokens that expire in <10s as stale

function isLive(state: FreshAuthState | null): boolean {
  if (!state) return false;
  return state.expiresAt - SAFETY_MARGIN_MS > Date.now();
}

function parseExpiresAt(value: string | number): number {
  if (typeof value === 'number') return value;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now() + 5 * 60 * 1000;
}

export function FreshAuthProvider({ children }: { children: ReactNode }) {
  const stateRef = useRef<FreshAuthState | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingRef = useRef<DeferredAuth | null>(null);

  const reauth = useReauthMutation();

  const closeDialog = useCallback(() => {
    setOpen(false);
    setPassword('');
    setErrorMessage(null);
  }, []);

  const ensureFreshAuth = useCallback((): Promise<string> => {
    if (isLive(stateRef.current) && stateRef.current) {
      return Promise.resolve(stateRef.current.token);
    }
    return new Promise<string>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      setErrorMessage(null);
      setPassword('');
      setOpen(true);
    });
  }, []);

  const clearFreshAuth = useCallback(() => {
    stateRef.current = null;
  }, []);

  const submit = useCallback(async () => {
    if (!password) {
      setErrorMessage('Password is required');
      return;
    }
    setErrorMessage(null);
    try {
      const data = await reauth.mutateAsync({ password });
      const expiresAtMs = parseExpiresAt(data.expiresAt);
      stateRef.current = { token: data.token, expiresAt: expiresAtMs };
      const pending = pendingRef.current;
      pendingRef.current = null;
      closeDialog();
      pending?.resolve(data.token);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? // axios error
            ((err as { response?: { data?: { message?: string } } }).response?.data?.message ??
            'Invalid credentials')
          : 'Invalid credentials';
      setErrorMessage(message);
    }
  }, [closeDialog, password, reauth]);

  const cancel = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    closeDialog();
    pending?.reject(new Error('Fresh auth cancelled'));
  }, [closeDialog]);

  const value = useMemo<FreshAuthContextValue>(
    () => ({ ensureFreshAuth, clearFreshAuth }),
    [ensureFreshAuth, clearFreshAuth],
  );

  return (
    <FreshAuthContext.Provider value={value}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) cancel();
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your password</AlertDialogTitle>
            <AlertDialogDescription>
              This action requires recent authentication. Enter your password to continue. The
              fresh-auth token expires after 5 minutes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="flex flex-col gap-3"
          >
            <input
              type="password"
              ref={(el) => el?.focus()}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
              disabled={reauth.isLoading}
              aria-label="Password"
            />
            {errorMessage ? (
              <div className="text-sm text-red-500" role="alert">
                {errorMessage}
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={cancel}
                className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reauth.isLoading || !password}
                className="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-100"
              >
                {reauth.isLoading ? 'Confirming…' : 'Confirm'}
              </button>
            </div>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </FreshAuthContext.Provider>
  );
}

export function useFreshAuth(): FreshAuthContextValue {
  const ctx = useContext(FreshAuthContext);
  if (!ctx) {
    throw new Error('useFreshAuth must be used inside <FreshAuthProvider>');
  }
  return ctx;
}

/* ---------- useAdminMutation wrapper ---------- */

type MinimalMutation<TData, TVars extends Record<string, unknown>> = {
  mutateAsync: (vars: TVars) => Promise<TData>;
};

type MaybeAxiosError = {
  response?: {
    status?: number;
    data?: { code?: string; message?: string };
  };
  code?: string;
};

function getErrorCode(err: unknown): string | undefined {
  const e = err as MaybeAxiosError;
  return e?.response?.data?.code ?? e?.code;
}

/**
 * Wrap any admin mutation so that a `FRESH_AUTH_REQUIRED` (401) failure
 * automatically prompts the admin for their password and retries the
 * mutation once with the new token. Page agents call `runAdminMutation(vars)`
 * just like a normal `mutateAsync`.
 *
 * The variables type must allow an optional `freshAuthToken` field — all
 * admin request payloads in `librechat-data-provider/types/admin` already do.
 */
export function useAdminMutation<
  TData,
  TVars extends Record<string, unknown> & { freshAuthToken?: string },
>(mutation: MinimalMutation<TData, TVars>) {
  const { ensureFreshAuth } = useFreshAuth();
  return useCallback(
    async (vars: TVars): Promise<TData> => {
      try {
        return await mutation.mutateAsync(vars);
      } catch (err) {
        const code = getErrorCode(err);
        if (code !== 'FRESH_AUTH_REQUIRED') throw err;
        const token = await ensureFreshAuth();
        return await mutation.mutateAsync({ ...vars, freshAuthToken: token });
      }
    },
    [ensureFreshAuth, mutation],
  );
}
