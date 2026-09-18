import { EModelEndpoint, normalizeEndpointName } from 'librechat-data-provider';
import type { MediaIntegration, MediaUserKey } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { MediaProviderAdapter } from './provider';
import type { MediaRoutingPolicy } from './routing';
import { mediaRoutingPolicySchema } from './routing';
import { MediaServiceError } from './errors';

type SettingsInput = { integration: MediaIntegration; appConfig: AppConfig };
export interface MediaEnvironment {
  GOOGLE_KEY?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_REVERSE_PROXY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_REVERSE_PROXY?: string;
  [name: string]: string | undefined;
}
/** Match the admin secret envelope, while preserving literal provider keys beginning with v3:. */
const encryptedPayload = /^v3:[0-9a-f]{32}:[0-9a-f]+$/;

interface MediaCredentialSettings {
  apiKey?: string;
  baseURL?: string;
  keyName: string;
  userKey?: MediaUserKey;
  keyHeader: string;
  keyPrefix: string;
  headers?: Record<string, string>;
  options?: Record<string, string>;
  routing?: MediaRoutingPolicy;
  configuration?: MediaProviderAdapter['configuration'];
}

export interface MediaCredentialConfiguration {
  read(input: SettingsInput, resolveSecrets?: boolean): MediaCredentialSettings | undefined;
  describe(input: SettingsInput): MediaUserKey | undefined;
  expand(value: string): string;
}

export function createMediaCredentialConfiguration({
  environment,
  adapters,
  resolveConfigSecret,
}: {
  environment: MediaEnvironment;
  adapters: readonly MediaProviderAdapter[];
  resolveConfigSecret?: (value: string) => string | undefined;
}): MediaCredentialConfiguration {
  const expand = (value: string) =>
    value.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (_match, name: string) => environment[name] ?? '',
    );
  const expanded = (values?: Record<string, string>) =>
    values
      ? Object.fromEntries(Object.entries(values).map(([name, value]) => [name, expand(value)]))
      : undefined;

  function read({ integration, appConfig }: SettingsInput, resolveSecrets = true) {
    if (integration.endpointRef.kind === 'vertex') return undefined;
    const configuration = adapters.find(
      (adapter) => adapter.api === integration.api,
    )?.configuration;
    let apiKey: string | undefined;
    let baseURL: string | undefined;
    let keyName: string;
    let encoding: MediaUserKey['encoding'] = 'apiKey';
    let headers: Record<string, string> | undefined;
    let options: Record<string, string> | undefined;
    let routing: MediaRoutingPolicy | undefined;
    if (integration.endpointRef.kind === 'direct') {
      if (!configuration)
        throw new MediaServiceError('unsupported', 422, 'This direct provider is unavailable.');
      const endpoint = integration.endpointRef;
      keyName = endpoint.credentialName ?? integration.id;
      apiKey = expand(endpoint.apiKey);
      baseURL = expand(endpoint.baseURL ?? configuration.baseURL);
      options = expanded(endpoint.options);
      headers = expanded(endpoint.headers);
    } else if (integration.endpointRef.kind === 'custom') {
      const name = normalizeEndpointName(integration.endpointRef.name);
      const endpoints = appConfig.endpoints?.custom ?? [];
      const exact = endpoints.find((entry) => normalizeEndpointName(entry.name) === name);
      const aliases = exact
        ? []
        : endpoints.filter((entry) => entry.name?.toLowerCase() === name.toLowerCase());
      const endpoint = exact ?? (aliases.length === 1 ? aliases[0] : undefined);
      if (!endpoint?.name)
        throw new MediaServiceError(
          'not_ready',
          422,
          'The configured media endpoint does not exist.',
        );
      keyName = normalizeEndpointName(endpoint.name);
      const configuredKey = endpoint.apiKey ?? '';
      if (encryptedPayload.test(configuredKey.trim())) {
        apiKey = resolveSecrets ? resolveConfigSecret?.(configuredKey) : configuredKey;
        if (resolveSecrets && (!apiKey || encryptedPayload.test(apiKey.trim())))
          throw new MediaServiceError(
            'not_ready',
            422,
            'The configured media credential could not be decrypted.',
          );
      } else apiKey = expand(configuredKey);
      baseURL = expand(endpoint.baseURL ?? '');
      headers = expanded(endpoint.headers);
      if (integration.api.startsWith('openrouter.') && endpoint.addParams?.provider !== undefined) {
        const parsed = mediaRoutingPolicySchema.safeParse(endpoint.addParams.provider);
        if (!parsed.success)
          throw new MediaServiceError(
            'not_ready',
            422,
            'The provider policy is not supported by media.',
          );
        routing = parsed.data;
      }
    } else {
      keyName = integration.endpointRef.endpoint;
      if (keyName === 'google') {
        encoding = 'google';
        apiKey = environment.GOOGLE_KEY || environment.GEMINI_API_KEY;
        baseURL =
          environment.GOOGLE_REVERSE_PROXY || 'https://generativelanguage.googleapis.com/v1beta';
      } else if (keyName === 'openAI') {
        apiKey = environment.OPENAI_API_KEY;
        baseURL = environment.OPENAI_REVERSE_PROXY || 'https://api.openai.com/v1';
      } else
        throw new MediaServiceError('unsupported', 422, 'This native connection is not supported.');
    }
    const userProvideURL = baseURL === 'user_provided';
    const userKey: MediaUserKey | undefined =
      apiKey === 'user_provided' || userProvideURL
        ? { keyName, encoding, userProvideURL }
        : undefined;
    const keyHeader =
      configuration?.keyHeader ??
      (integration.api.startsWith('google.') ? 'x-goog-api-key' : 'Authorization');
    const keyPrefix = configuration?.keyPrefix ?? (keyHeader === 'Authorization' ? 'Bearer ' : '');
    return {
      apiKey,
      baseURL,
      keyName,
      userKey,
      keyHeader,
      keyPrefix,
      headers,
      options,
      routing,
      configuration,
    };
  }

  function describe(input: SettingsInput): MediaUserKey | undefined {
    const userKey = read(input, false)?.userKey;
    if (!userKey) return undefined;
    /** Google chat owns this key's existing envelope even without a media builtin entry. */
    if (userKey.keyName === 'google' && userKey.encoding !== 'google')
      throw new MediaServiceError(
        'not_ready',
        422,
        'This credential name uses the Google credential format.',
      );
    if (
      Object.values(EModelEndpoint).some((endpoint) => endpoint === userKey.keyName) &&
      !['openAI', 'assistants', 'google'].includes(userKey.keyName)
    )
      throw new MediaServiceError(
        'not_ready',
        422,
        'This credential name belongs to a different chat credential format.',
      );
    for (const integration of input.appConfig.media?.integrations ?? []) {
      if (integration.id === input.integration.id || integration.enabled === false) continue;
      let other: MediaUserKey | undefined;
      try {
        other = read({ ...input, integration }, false)?.userKey;
      } catch {
        continue;
      }
      if (other?.keyName === userKey.keyName && other.encoding !== userKey.encoding)
        throw new MediaServiceError(
          'not_ready',
          422,
          'Shared credential names must use the same credential format.',
        );
    }
    return userKey;
  }

  return { read, describe, expand };
}
