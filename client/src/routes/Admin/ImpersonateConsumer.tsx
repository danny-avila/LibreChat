/* eslint-disable i18next/no-literal-string */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useConsumeImpersonationMutation } from '~/data-provider/Admin';

/**
 * Consumer page mounted at `/login/impersonate`. Reads the one-shot token
 * from the URL, exchanges it for a real session, and redirects to /c/new.
 *
 * The server endpoint refuses to consume if the caller already has a Bearer
 * token, so this works correctly only when opened in a tab without an
 * existing session.
 */
export default function ImpersonateConsumer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const consume = useConsumeImpersonationMutation();
  const calledRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const token = searchParams.get('token') ?? '';

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    if (!token) {
      setErrorMessage('Missing impersonation token.');
      return;
    }

    // Strip the token from the URL so it doesn't end up in browser history.
    try {
      window.history.replaceState({}, '', '/login/impersonate');
    } catch {
      /* ignore */
    }

    consume.mutate(
      { token },
      {
        onSuccess: (data) => {
          // Handoff to AuthContext via sessionStorage. The same key is used
          // by the registration flow (see AuthContext.tsx) — on the next
          // mount, AuthContext consumes this and sets up the session
          // without needing to round-trip through /api/auth/refresh. This
          // is more reliable than cookie-only handoff across a hard
          // navigation, where the browser may not have committed the
          // Set-Cookie header before the next request fires.
          try {
            sessionStorage.setItem(
              'registrationAuth',
              JSON.stringify({ token: data.token, user: data.user }),
            );
          } catch {
            /* ignore — fall through to cookie-driven refresh */
          }
          window.location.replace('/c/new');
        },
        onError: (err: unknown) => {
          const e = err as {
            response?: { data?: { message?: string; code?: string } };
            message?: string;
          };
          const code = e?.response?.data?.code;
          if (code === 'ALREADY_AUTHENTICATED') {
            setErrorMessage(
              'You are already signed in. Log out first, then click the impersonation link again.',
            );
            return;
          }
          setErrorMessage(
            e?.response?.data?.message ?? e?.message ?? 'Could not consume impersonation token.',
          );
        },
      },
    );
    // We only want to run this on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {errorMessage ? (
          <>
            <h1 className="text-lg font-semibold text-red-600 dark:text-red-400">
              Impersonation failed
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{errorMessage}</p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="mt-4 inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              Go to login
            </button>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
              Signing you in…
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Consuming the one-time impersonation token.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
