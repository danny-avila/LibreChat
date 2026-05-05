// Demo consumer for `litellmClient` — logs the allowed models for the
// current user. Mount from any component (e.g. a settings page) once the
// xcity-home `/api/me/litellm-key` endpoint is live, to verify the
// xcity-tokenhub bearer flow end-to-end without touching the LibreChat
// model selector.
//
// Usage:
//   import { runLitellmDemo } from '~/utils/litellmDemo';
//   useEffect(() => { runLitellmDemo(); }, []);

import { listAllowedModels } from './litellmClient';

/**
 * Fetch the LiteLLM models the current user can invoke through tokenhub
 * and print them. Resolves to the model list (or `null` on failure).
 *
 * Designed to be safe to call from `useEffect` — never throws; logs the
 * error and resolves to `null` instead so demo callers don't need a
 * `try/catch`.
 */
export async function runLitellmDemo(): Promise<string[] | null> {
  try {
    const models = await listAllowedModels();
    console.log('[litellm-demo] allowed models:', models);
    return models;
  } catch (error) {
    console.error('[litellm-demo] failed to list models:', error);
    return null;
  }
}
