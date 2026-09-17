import { z } from 'zod';
import { createHash } from 'node:crypto';
import { resolveMediaConfig } from 'librechat-data-provider';
import type { AppConfig, MediaMethods, MediaOwnerScope } from '@librechat/data-schemas';
import type { MediaIntegration } from 'librechat-data-provider';
import type { MediaConnection, MediaProviderAdapter } from './provider';
import type { MediaVertexCredentialProvider } from './vertexAuth';
import type { MediaRoutingPolicy } from './routing';
import { mediaRoutingPolicySchema } from './routing';
import { MediaServiceError } from './errors';

export interface MediaEnvironment {
  GOOGLE_KEY?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_REVERSE_PROXY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_REVERSE_PROXY?: string;
  [name: string]: string | undefined;
}

export function createMediaCredentialResolver({
  environment,
  repository,
  decrypt,
  now,
  vertexCredentials,
  adapters = [],
}: {
  environment: MediaEnvironment;
  repository: Pick<MediaMethods, 'getStoredMediaCredential'>;
  decrypt: (value: string) => Promise<string>;
  now: () => number;
  vertexCredentials?: MediaVertexCredentialProvider;
  adapters?: readonly MediaProviderAdapter[];
}) {
  const expand = (value: string): string =>
    value.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (_match, name: string) => environment[name] ?? '',
    );

  return async function resolve({
    scope,
    integration,
    appConfig,
    minValidityMs,
  }: {
    scope: MediaOwnerScope;
    integration: MediaIntegration;
    appConfig: AppConfig;
    minValidityMs: number;
  }): Promise<MediaConnection> {
    if (integration.endpointRef.kind === 'vertex') {
      if (!vertexCredentials) {
        throw new MediaServiceError('not_ready', 422, 'Vertex authentication is unavailable.');
      }
      const endpoint = integration.endpointRef;
      const credential = await vertexCredentials({
        keyFile: expand(endpoint.keyFile),
        projectId: endpoint.projectId ? expand(endpoint.projectId) : undefined,
        minValidityMs,
        timeoutMs: (appConfig.media ?? resolveMediaConfig()).catalog.requestTimeoutMs,
      });
      const hostname =
        endpoint.location === 'global'
          ? 'aiplatform.googleapis.com'
          : `${endpoint.location}-aiplatform.googleapis.com`;
      const baseURL = `https://${hostname}/v1/projects/${encodeURIComponent(credential.projectId)}/locations/${endpoint.location}/publishers/google/`;
      return {
        id: integration.id,
        api: integration.api,
        baseURL,
        headers: { Authorization: `Bearer ${credential.accessToken}` },
        binding: createHash('sha256')
          .update(
            JSON.stringify({
              api: integration.api,
              baseURL,
              revision: credential.revision,
            }),
          )
          .digest('hex'),
      };
    }
    let apiKey: string | undefined;
    let baseURL: string | undefined;
    let credentialName: string;
    let routing: MediaRoutingPolicy | undefined;
    let headers: Record<string, string> | undefined;
    let options: Record<string, string> | undefined;
    let keyHeader = integration.api.startsWith('google.') ? 'x-goog-api-key' : 'Authorization';
    let keyPrefix = keyHeader === 'Authorization' ? 'Bearer ' : '';
    const expanded = (values?: Record<string, string>) =>
      values
        ? Object.fromEntries(Object.entries(values).map(([name, value]) => [name, expand(value)]))
        : undefined;
    if (integration.endpointRef.kind === 'direct') {
      const endpoint = integration.endpointRef;
      const configuration = adapters.find(
        (adapter) => adapter.api === integration.api,
      )?.configuration;
      if (!configuration)
        throw new MediaServiceError('unsupported', 422, 'This direct provider is unavailable.');
      credentialName = endpoint.credentialName ?? integration.id;
      apiKey = expand(endpoint.apiKey);
      baseURL = expand(endpoint.baseURL ?? configuration.baseURL);
      options = expanded(endpoint.options);
      headers = { ...configuration.headers, ...expanded(endpoint.headers) };
      keyHeader = configuration.keyHeader ?? 'Authorization';
      keyPrefix = configuration.keyPrefix ?? (keyHeader === 'Authorization' ? 'Bearer ' : '');
      if (configuration.requiredOptions?.some((name) => !options?.[name]))
        throw new MediaServiceError(
          'not_ready',
          422,
          'The direct provider requires additional configuration.',
        );
    } else if (integration.endpointRef.kind === 'custom') {
      const name = integration.endpointRef.name;
      const endpoint = appConfig.endpoints?.custom?.find(
        (entry) => entry.name?.toLowerCase() === name.toLowerCase(),
      );
      if (!endpoint?.name) {
        throw new MediaServiceError(
          'not_ready',
          422,
          'The configured media endpoint does not exist.',
        );
      }
      credentialName = endpoint.name;
      apiKey = expand(endpoint.apiKey ?? '');
      baseURL = expand(endpoint.baseURL ?? '');
      headers = expanded(endpoint.headers);
      if (integration.api.startsWith('openrouter.') && endpoint.addParams?.provider !== undefined) {
        const parsed = mediaRoutingPolicySchema.safeParse(endpoint.addParams.provider);
        if (!parsed.success) {
          throw new MediaServiceError(
            'not_ready',
            422,
            'The provider policy is not supported by media.',
          );
        }
        routing = parsed.data;
      }
    } else {
      credentialName = integration.endpointRef.endpoint;
      if (credentialName === 'google') {
        apiKey = environment.GOOGLE_KEY || environment.GEMINI_API_KEY;
        baseURL =
          environment.GOOGLE_REVERSE_PROXY || 'https://generativelanguage.googleapis.com/v1beta';
      } else if (credentialName === 'openAI') {
        apiKey = environment.OPENAI_API_KEY;
        baseURL = environment.OPENAI_REVERSE_PROXY || 'https://api.openai.com/v1';
      } else {
        throw new MediaServiceError('unsupported', 422, 'This native connection is not supported.');
      }
    }
    let binding = `deployment:${credentialName}`;
    if (apiKey === 'user_provided' || baseURL === 'user_provided') {
      const record = await repository.getStoredMediaCredential({ scope, name: credentialName });
      if (!record) {
        throw new MediaServiceError(
          'credentials_required',
          403,
          'Save a provider credential before queueing media.',
        );
      }
      if (record.expiresAt && Date.parse(record.expiresAt) <= now() + minValidityMs) {
        throw new MediaServiceError(
          'credentials_expired',
          403,
          'The provider credential has expired.',
        );
      }
      const value = await decrypt(record.value);
      if (credentialName === 'google' && integration.endpointRef.kind === 'builtin') {
        apiKey = value;
      } else {
        const saved = z
          .object({ apiKey: z.string(), baseURL: z.string().optional() })
          .parse(JSON.parse(value));
        if (apiKey === 'user_provided') {
          apiKey = saved.apiKey;
        }
        if (baseURL === 'user_provided') {
          baseURL = saved.baseURL;
        }
      }
      binding = `user:${scope.ownerId}:${credentialName}:${record.bindingRevision}`;
    }
    if (!apiKey || !baseURL) {
      throw new MediaServiceError(
        'credentials_required',
        403,
        'The provider credential is missing.',
      );
    }
    if (
      headers &&
      Object.entries(headers).some(
        ([name, value]) =>
          !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
          /[\r\n]/.test(value) ||
          /^(host|content-length|transfer-encoding|connection)$/i.test(name),
      )
    )
      throw new MediaServiceError('not_ready', 422, 'Invalid provider headers.');
    const root = new URL(baseURL);
    if (
      !['https:', 'http:'].includes(root.protocol) ||
      root.username ||
      root.password ||
      root.search ||
      root.hash ||
      /\/(chat\/completions|responses)\/?$/.test(root.pathname)
    ) {
      throw new MediaServiceError('not_ready', 422, 'Configure the provider API root for media.');
    }
    return {
      id: integration.id,
      api: integration.api,
      baseURL: root.href,
      routing,
      options,
      binding: createHash('sha256')
        .update(
          JSON.stringify({
            binding,
            root: root.href,
            api: integration.api,
            routing,
            ...(headers && Object.keys(headers).length ? { headers } : {}),
            ...(options ? { options } : {}),
            keyRevision: createHash('sha256').update(apiKey).digest('hex'),
          }),
        )
        .digest('hex'),
      headers: { ...headers, [keyHeader]: `${keyPrefix}${apiKey}` },
    };
  };
}
