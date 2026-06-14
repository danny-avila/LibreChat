import type { AnthropicClientOptions, GoogleClientOptions } from '@librechat/agents';
import type { IUser } from '@librechat/data-schemas';
import type { RequestBody, RunLLMConfig } from '~/types';
import { resolveHeaders } from './env';

/**
 * Merges two header maps, with `override` winning on key collisions. The
 * `anthropic-beta` header is special-cased: values from both sides are
 * comma-unioned (deduped) so a custom beta coexists with provider-managed
 * betas instead of clobbering them.
 *
 * Used both to layer endpoint headers over global (`endpoints.all`) headers and
 * to attach admin-configured custom headers beneath provider-managed headers
 * (auth/version/beta), so the provider integration's own headers always win.
 *
 * @returns the merged map, or `undefined` when neither side has any headers.
 */
export function mergeHeaders(
  base?: Record<string, string>,
  override?: Record<string, string>,
): Record<string, string> | undefined {
  if (!base && !override) {
    return undefined;
  }

  const merged: Record<string, string> = { ...(base ?? {}), ...(override ?? {}) };

  const baseBeta = base?.['anthropic-beta'];
  const overrideBeta = override?.['anthropic-beta'];
  if (baseBeta && overrideBeta) {
    const betaValues = [baseBeta, overrideBeta]
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);
    merged['anthropic-beta'] = Array.from(new Set(betaValues)).join(',');
  }

  return merged;
}

type DefaultHeadersContainer = { defaultHeaders?: Record<string, string> };

/**
 * Resolves placeholder templates in the outbound request headers of a built LLM
 * config, mutating it in place. Header maps live in provider-specific locations:
 *
 * - `configuration.defaultHeaders` — OpenAI-compatible (OpenAI / Azure / custom)
 * - `clientOptions.defaultHeaders` — native Anthropic (including Vertex)
 * - `customHeaders` — native Google / Vertex AI
 *
 * Resolution runs at request time so request-body placeholders (e.g.
 * `{{LIBRECHAT_BODY_CONVERSATIONID}}`) resolve against the live request. It is a
 * no-op for header values without placeholders, so it is safe to call for every
 * provider regardless of whether custom headers were configured.
 */
export function resolveConfigHeaders({
  llmConfig,
  user,
  body,
  customUserVars,
}: {
  llmConfig?: RunLLMConfig | null;
  user?: Partial<IUser> | { id: string };
  body?: RequestBody;
  customUserVars?: Record<string, string>;
}): void {
  if (llmConfig == null) {
    return;
  }

  const resolve = (headers: Record<string, string>): Record<string, string> =>
    resolveHeaders({ headers, user, body, customUserVars });

  const configuration = llmConfig.configuration as DefaultHeadersContainer | undefined;
  if (configuration?.defaultHeaders != null) {
    configuration.defaultHeaders = resolve(configuration.defaultHeaders);
  }

  const clientOptions = (llmConfig as AnthropicClientOptions).clientOptions as
    | DefaultHeadersContainer
    | undefined;
  if (clientOptions?.defaultHeaders != null) {
    clientOptions.defaultHeaders = resolve(clientOptions.defaultHeaders);
  }

  const googleConfig = llmConfig as GoogleClientOptions;
  if (googleConfig.customHeaders != null) {
    googleConfig.customHeaders = resolve(googleConfig.customHeaders as Record<string, string>);
  }
}
