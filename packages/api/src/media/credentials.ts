import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { AppConfig, MediaMethods, MediaOwnerScope } from '@librechat/data-schemas';
import type { MediaIntegration } from 'librechat-data-provider';
import type { MediaRoutingPolicy } from './routing';
import type { MediaConnection } from './provider';
import { mediaRoutingPolicySchema } from './routing';
import { MediaServiceError } from './errors';

export interface MediaEnvironment {
  GOOGLE_KEY?: string;
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
}: {
  environment: MediaEnvironment;
  repository: Pick<MediaMethods, 'getStoredMediaCredential'>;
  decrypt: (value: string) => Promise<string>;
  now: () => number;
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
    let apiKey: string | undefined;
    let baseURL: string | undefined;
    let credentialName: string;
    let routing: MediaRoutingPolicy | undefined;
    if (integration.endpointRef.kind === 'custom') {
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
        apiKey = environment.GOOGLE_KEY;
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
      binding: createHash('sha256')
        .update(
          JSON.stringify({
            binding,
            root: root.href,
            api: integration.api,
            routing,
            keyRevision: createHash('sha256').update(apiKey).digest('hex'),
          }),
        )
        .digest('hex'),
      headers: integration.api.startsWith('google.')
        ? { 'x-goog-api-key': apiKey }
        : { Authorization: `Bearer ${apiKey}` },
    };
  };
}
