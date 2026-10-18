import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The platform operator acting through the admin panel, for the rest of one admin request. Only
 * the admin scope enters it, after re-reading the operator flag from the operator's login
 * account, so neither a stored record nor a token can claim it.
 */
const operatorPrincipal = new AsyncLocalStorage<{ operatorId: string }>();

/** Runs `fn` with the platform operator `operatorId` acting, holding every capability. */
export function runAsOperatorPrincipal<T>(operatorId: string, fn: () => T): T {
  return operatorPrincipal.run({ operatorId }, fn);
}

/** Whether `userId` is the platform operator acting in the current admin request. */
export function isOperatorPrincipal(userId: string | undefined): boolean {
  return userId != null && operatorPrincipal.getStore()?.operatorId === userId;
}
