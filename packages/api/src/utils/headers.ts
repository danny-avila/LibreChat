import type { AnthropicClientOptions, GoogleClientOptions } from '@librechat/agents';
import type { IUser } from '@librechat/data-schemas';
import type { RequestBody, RunLLMConfig } from '~/types';
import { resolveHeaders } from './env';

/** Comma-unions two header values (deduped, trimmed), e.g. `anthropic-beta`. */
function unionCsv(a: string, b: string): string {
  const values = [a, b]
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(values)).join(',');
}

/**
 * Merges two header maps, with `override` winning on key collisions. Matching is
 * case-insensitive (HTTP header names are), so an `override` key replaces any
 * case variant from `base` rather than leaving both names in the output (which
 * clients may collapse, breaking auth or protocol headers); the `override`
 * casing is kept. The `anthropic-beta` header is special-cased: values from both
 * sides are comma-unioned (deduped) so a custom beta coexists with
 * provider-managed betas instead of clobbering them.
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

  const merged: Record<string, string> = { ...(base ?? {}) };
  if (!override) {
    return merged;
  }

  const baseKeyByLower = new Map<string, string>(
    Object.keys(merged).map((key) => [key.toLowerCase(), key]),
  );

  for (const [key, value] of Object.entries(override)) {
    const lower = key.toLowerCase();
    const existingKey = baseKeyByLower.get(lower);
    const nextValue =
      lower === 'anthropic-beta' && existingKey != null
        ? unionCsv(merged[existingKey], value)
        : value;

    if (existingKey != null && existingKey !== key) {
      delete merged[existingKey];
    }
    merged[key] = nextValue;
    baseKeyByLower.set(lower, key);
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
    googleConfig.customHeaders = resolveCustomHeaders(
      googleConfig.customHeaders as Record<string, string>,
      resolve,
    );
  }
}

/**
 * Resolves Google `customHeaders` while leaving the provider-managed
 * `Authorization` header untouched. That header is built from the API key
 * (possibly user-provided when `GOOGLE_KEY=user_provided`), not an admin
 * template, so passing it through placeholder/env resolution could expand a
 * user-controlled `${ENV}` reference and leak server environment values.
 */
function resolveCustomHeaders(
  headers: Record<string, string>,
  resolve: (headers: Record<string, string>) => Record<string, string>,
): Record<string, string> {
  const managed: Record<string, string> = {};
  const templated: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    (key.toLowerCase() === 'authorization' ? managed : templated)[key] = value;
  }
  return { ...resolve(templated), ...managed };
}
