import { useCallback } from 'react';
import type { ReactNode } from 'react';

/**
 * The fresh-auth (password-confirmation) layer was removed from the admin
 * dashboard so SSO-only admins (Google, Apple, etc.) can still perform
 * destructive actions without first needing to set a local password.
 *
 * This module is now intentionally a thin compatibility shim:
 *  - `FreshAuthProvider` is a pass-through (no longer renders a modal)
 *  - `useAdminMutation(mutation)` returns a `mutateAsync`-compatible function
 *
 * Callers (dialogs in `client/src/components/Admin/`) don't need to change
 * — they keep wrapping with `useAdminMutation(...)` and the wrapper now
 * just calls through to TanStack Query's `mutateAsync` directly. If we
 * ever reintroduce a step-up factor (e.g. SSO re-confirmation), this is
 * the single seam to put it back behind.
 */

type MinimalMutation<TData, TVars> = {
  mutateAsync: (vars: TVars) => Promise<TData>;
};

export function FreshAuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAdminMutation<TData, TVars>(mutation: MinimalMutation<TData, TVars>) {
  return useCallback(async (vars: TVars): Promise<TData> => mutation.mutateAsync(vars), [mutation]);
}
