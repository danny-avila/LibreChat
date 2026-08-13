import type { ClerkAuthConfig } from './types';

export interface ClerkStartupDeps {
  ensureClerkIndexes: (connection: unknown) => Promise<void>;
  connection: unknown;
}

/**
 * Startup readiness gate for both server entry points: a no-op when Clerk is
 * disabled, otherwise awaits index assurance and lets a rejection propagate so
 * the caller's existing fail-closed `startServer().catch(...)` handling applies.
 */
export async function ensureClerkStartupReady(
  clerkAuthConfig: ClerkAuthConfig,
  deps: ClerkStartupDeps,
): Promise<void> {
  if (!clerkAuthConfig.enabled) {
    return;
  }
  await deps.ensureClerkIndexes(deps.connection);
}
