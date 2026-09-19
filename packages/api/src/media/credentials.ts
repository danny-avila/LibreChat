import { z } from 'zod';
import { createHash } from 'node:crypto';
import { AuthKeys, resolveMediaConfig } from 'librechat-data-provider';
import type { AppConfig, MediaMethods, MediaOwnerScope } from '@librechat/data-schemas';
import type { MediaIntegration, MediaUserKey } from 'librechat-data-provider';
import type { MediaConnection, MediaProviderAdapter } from './provider';
import type { MediaVertexCredentialProvider } from './vertexAuth';
import type { MediaEnvironment } from './credentialConfig';
import type { SafeUserInput } from '../utils/env';
import { createMediaCredentialConfiguration } from './credentialConfig';
import { mergeHeaders, resolveModelHeaders } from '../utils/headers';
import { MediaServiceError } from './errors';
import { isEnabled } from '../utils/common';

export type { MediaEnvironment } from './credentialConfig';

export interface MediaCredentialInput {
  scope: MediaOwnerScope;
  integration: MediaIntegration;
  appConfig: AppConfig;
  minValidityMs: number;
  user?: SafeUserInput;
}

export interface MediaCredentialResolver {
  (input: MediaCredentialInput): Promise<MediaConnection>;
  describe(
    input: Pick<MediaCredentialInput, 'integration' | 'appConfig'>,
  ): MediaUserKey | undefined;
}

export function createMediaCredentialResolver({
  environment,
  repository,
  decrypt,
  now,
  vertexCredentials,
  adapters = [],
  resolveConfigSecret,
}: {
  environment: MediaEnvironment;
  repository: Pick<MediaMethods, 'getStoredMediaCredential'>;
  decrypt: (value: string) => Promise<string>;
  now: () => number;
  vertexCredentials?: MediaVertexCredentialProvider;
  adapters?: readonly MediaProviderAdapter[];
  resolveConfigSecret?: (value: string) => string | undefined;
}): MediaCredentialResolver {
  const settings = createMediaCredentialConfiguration({
    environment,
    adapters,
    resolveConfigSecret,
  });
  const { expand } = settings;

  async function resolve({
    scope,
    integration,
    appConfig,
    minValidityMs,
    user,
  }: MediaCredentialInput): Promise<MediaConnection> {
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
        allowedAddresses: appConfig.endpoints?.allowedAddresses ?? [],
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
    const configured = settings.read({ integration, appConfig });
    if (!configured)
      throw new MediaServiceError('not_ready', 422, 'Media credentials are unavailable.');
    const userKey = settings.describe({ integration, appConfig });
    let { apiKey, baseURL } = configured;
    const {
      keyName: credentialName,
      keyHeader,
      keyPrefix,
      routing,
      options,
      configuration,
    } = configured;
    const legacyHeaders = userKey?.userProvideURL
      ? { ...configuration?.headers }
      : { ...configuration?.headers, ...configured.legacyHeaders };
    const headers = resolveModelHeaders({
      headers: userKey?.userProvideURL
        ? configuration?.headers
        : mergeHeaders(configuration?.headers, configured.headers),
      user: { ...user, id: scope.ownerId },
      tenantId: scope.tenantId ?? undefined,
    });
    if (userKey?.userProvideURL && options && Object.keys(options).length)
      throw new MediaServiceError(
        'not_ready',
        422,
        'User-provided API URLs cannot be combined with configured provider options.',
      );
    if (
      integration.endpointRef.kind === 'direct' &&
      configuration?.requiredOptions?.some((name) => !options?.[name])
    )
      throw new MediaServiceError(
        'not_ready',
        422,
        'The direct provider requires additional configuration.',
      );
    let binding = `deployment:${credentialName}`;
    let legacyBindings: string[] = [];
    if (userKey) {
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
      try {
        const value = await decrypt(record.value);
        const secret = z
          .string()
          .min(1)
          .refine((key) => key.trim().length > 0 && key !== 'user_provided' && !/[\r\n]/.test(key));
        if (userKey.encoding === 'google' && !value.trim().startsWith('{')) {
          apiKey = secret.parse(value);
          if (userKey.userProvideURL) throw new Error('Missing user URL');
        } else {
          const field = userKey.encoding === 'google' ? AuthKeys.GOOGLE_API_KEY : 'apiKey';
          const saved = z
            .object({
              apiKey: z.string().optional(),
              [AuthKeys.GOOGLE_API_KEY]: z.string().optional(),
              baseURL: z.string().optional(),
            })
            .parse(JSON.parse(value));
          apiKey = secret.parse(saved[field]);
          if (userKey.userProvideURL) baseURL = z.string().min(1).parse(saved.baseURL);
        }
      } catch {
        throw new MediaServiceError(
          'credentials_required',
          403,
          'Save a valid provider credential before queueing media.',
        );
      }
      const prefix = `user:${scope.ownerId}:${credentialName}:`;
      binding = `${prefix}${record.id ?? record.bindingRevision}`;
      legacyBindings = [...new Set([record.bindingRevision, record.legacyBindingRevision])]
        .filter((revision): revision is string => !!revision)
        .map((revision) => `${prefix}${revision}`);
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
    let root: URL;
    try {
      root = new URL(baseURL);
    } catch {
      throw new MediaServiceError('not_ready', 422, 'Configure the provider API root for media.');
    }
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
    const digest = (identity: string, configuredHeaders: Record<string, string>) =>
      createHash('sha256')
        .update(
          JSON.stringify({
            binding: identity,
            root: root.href,
            api: integration.api,
            routing,
            ...(Object.keys(configuredHeaders).length ? { headers: configuredHeaders } : {}),
            ...(options ? { options } : {}),
            keyRevision: createHash('sha256').update(apiKey).digest('hex'),
          }),
        )
        .digest('hex');
    const authentication = {
      [keyHeader]: `${keyPrefix}${apiKey}`,
      ...(integration.endpointRef.kind === 'builtin' &&
      integration.endpointRef.endpoint === 'google' &&
      isEnabled(environment.GOOGLE_AUTH_HEADER)
        ? { Authorization: `Bearer ${apiKey}` }
        : {}),
    };
    return {
      id: integration.id,
      api: integration.api,
      baseURL: root.href,
      routing,
      options,
      binding: digest(binding, headers),
      bindingAliases: legacyBindings.map((legacy) => digest(legacy, legacyHeaders)),
      allowedAddresses: appConfig.endpoints?.allowedAddresses ?? [],
      headers: mergeHeaders(headers, authentication)!,
    };
  }
  return Object.assign(resolve, { describe: settings.describe });
}
