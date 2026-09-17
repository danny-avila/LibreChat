import { z } from 'zod';
import { createHash } from 'node:crypto';
import type {
  MediaCatalog,
  MediaCapability,
  MediaConfig,
  MediaIntegration,
  MediaOffering,
  MediaSubmissionRequest,
  MediaImageParameters,
  MediaVideoParameters,
  MediaNumberControl,
  MediaEnumControl,
  MediaLimits,
  MediaOptionValue,
  MediaUserKey,
  MediaErrorCode,
} from 'librechat-data-provider';
import type { MediaTransport, MediaTransportRequest } from './transport';
import type { MediaConnection, MediaProviderAdapter } from './provider';
import type { ResolvedMediaOffering } from './discovery';
import { vertexVideoCapabilities, vertexVideoModelName } from './adapters/vertexVideo';
import { openAIImageCapabilities, openAIVideoCapabilities } from './adapters/openai';
import { googleImageCapabilities } from './adapters/google';
import { discoverOpenRouter } from './discovery';
import { MediaServiceError } from './errors';

type ResolvedOffering = ResolvedMediaOffering;
type MediaCatalogSnapshot = { catalog: MediaCatalog; resolved: Map<string, ResolvedOffering> };

function selectedModels(integration: MediaIntegration, available: Iterable<string>): string[] {
  if (integration.catalog.kind === 'configured') return integration.catalog.models;
  const models =
    integration.catalog.allModels && !integration.catalog.allowModels.length
      ? [...available]
      : integration.catalog.allowModels;
  const excluded = new Set(integration.catalog.excludeModels);
  return models.filter((model) => !excluded.has(model));
}

function nativeCapabilities(
  integration: MediaIntegration,
  modelId: string,
  config: MediaConfig,
): MediaCapability[] {
  if (integration.api === 'google.vertex.videos') {
    return vertexVideoCapabilities(modelId, config);
  }
  if (integration.api === 'openai.images') return openAIImageCapabilities(modelId, config);
  if (integration.api === 'openai.videos') return openAIVideoCapabilities(modelId);
  if (integration.api === 'google.generateContent') return googleImageCapabilities(modelId, config);
  return [];
}

export function createMediaCatalog({
  transport,
  adapters,
  now,
}: {
  transport: MediaTransport;
  adapters: readonly MediaProviderAdapter[];
  now: () => number;
}) {
  const cache = new Map<string, { expires: number; value: ResolvedOffering[] }>();
  const pending = new Map<string, Promise<ResolvedOffering[]>>();
  const supported = new Set(adapters.map((adapter) => adapter.api));
  let activeRequests = 0;
  const waiting: Array<() => void> = [];

  async function discover<T>(
    request: MediaTransportRequest,
    schema: z.ZodType<T>,
    config: MediaConfig,
  ): Promise<T> {
    while (activeRequests >= config.catalog.maxConcurrentRequests) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    activeRequests++;
    try {
      return await transport.json(request, schema);
    } finally {
      activeRequests--;
      waiting.shift()?.();
    }
  }

  function store(key: string, value: ResolvedOffering[], config: MediaConfig) {
    cache.delete(key);
    for (const [entryKey, entry] of cache) {
      if (entry.expires <= now()) {
        cache.delete(entryKey);
      }
    }
    while (cache.size >= config.catalog.maxCacheEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      cache.delete(oldest);
    }
    cache.set(key, { expires: now() + config.catalog.refreshMs, value });
  }

  async function load(
    integration: MediaIntegration,
    connection: MediaConnection,
    config: MediaConfig,
  ): Promise<ResolvedOffering[]> {
    if (integration.api.startsWith('openrouter.')) {
      return discoverOpenRouter(integration, connection, config, discover);
    }
    const profiles = new Map(
      adapters
        .find((adapter) => adapter.api === integration.api)
        ?.catalog?.(config)
        .map((profile) => [profile.modelId, profile]),
    );
    const models = selectedModels(integration, profiles.keys());
    if (models.length > config.catalog.maxModels)
      throw new MediaServiceError(
        'not_ready',
        422,
        'The model catalog exceeds its configured limit.',
      );
    return models.map((modelId) => {
      const profile = profiles.get(modelId);
      const capabilities =
        profile?.capabilities ?? nativeCapabilities(integration, modelId, config);
      const permitted = capabilities.filter((capability) =>
        integration.operations.includes(capability.operation),
      );
      const available = !profile?.unavailableReason && permitted.length > 0;
      return {
        bindingRevision: connection.binding,
        offering: {
          connectionId: integration.id,
          connectionName: integration.label ?? integration.id,
          modelId,
          modelName:
            profile?.modelName ??
            (integration.api === 'google.vertex.videos'
              ? vertexVideoModelName(modelId)
              : undefined) ??
            modelId,
          api: integration.api,
          available,
          capabilities: available ? permitted : [],
          ...(!available
            ? { unavailableReason: profile?.unavailableReason ?? ('unsupported' as const) }
            : {}),
        },
      };
    });
  }

  return {
    async read(
      config: MediaConfig,
      resolve: (integration: MediaIntegration) => Promise<MediaConnection>,
      scope: string,
      describeUserKey?: (integration: MediaIntegration) => MediaUserKey | undefined,
    ): Promise<MediaCatalogSnapshot> {
      const resolutionErrors = new Map<string, MediaErrorCode>();
      const results = await Promise.all(
        config.integrations.map(async (integration): Promise<ResolvedOffering[]> => {
          const models = selectedModels(
            integration,
            adapters
              .find((adapter) => adapter.api === integration.api)
              ?.catalog?.(config)
              .map((profile) => profile.modelId) ?? [],
          );
          try {
            if (!supported.has(integration.api)) {
              throw new MediaServiceError('unsupported', 422, 'Unsupported media API');
            }
            const connection = await resolve(integration);
            const key = createHash('sha256')
              .update(
                JSON.stringify({
                  integration,
                  binding: connection.binding,
                  routing: connection.routing,
                  limits: config.limits,
                  catalog: config.catalog,
                }),
              )
              .digest('hex');
            const current = cache.get(key);
            if (current && current.expires > now()) {
              cache.delete(key);
              cache.set(key, current);
              return current.value;
            }
            let work = pending.get(key);
            if (!work) {
              if (pending.size >= config.catalog.maxCacheEntries) {
                throw new MediaServiceError('not_ready', 503, 'The media catalog is busy.');
              }
              work = load(integration, connection, config)
                .then((value) => {
                  store(key, value, config);
                  return value;
                })
                .finally(() => pending.delete(key));
              pending.set(key, work);
            }
            return await work;
          } catch (error) {
            const code =
              error instanceof MediaServiceError &&
              (error.code === 'credentials_required' ||
                error.code === 'credentials_expired' ||
                error.code === 'unsupported')
                ? error.code
                : 'not_ready';
            resolutionErrors.set(integration.id, code);
            return models.map((modelId) => ({
              offering: {
                connectionId: integration.id,
                connectionName: integration.label ?? integration.id,
                modelId,
                modelName: modelId,
                api: integration.api,
                available: false,
                unavailableReason: code,
                capabilities: [],
              },
            }));
          }
        }),
      );
      const entries = results.flat();
      const integrations = config.integrations.map((integration, index) => {
        let userKey: MediaUserKey | undefined;
        try {
          userKey = describeUserKey?.(integration);
        } catch {
          /* Invalid configuration stays unavailable. */
        }
        return {
          connectionId: integration.id,
          connectionName: integration.label ?? integration.id,
          api: integration.api,
          ...(userKey ? { userKey } : {}),
          available: results[index].some((entry) => entry.offering.available),
          ...(!results[index].some((entry) => entry.offering.available)
            ? {
                unavailableReason:
                  resolutionErrors.get(integration.id) ??
                  results[index][0]?.offering.unavailableReason ??
                  ('not_ready' as const),
              }
            : {}),
        };
      });
      const version = createHash('sha256')
        .update(JSON.stringify({ scope, entries, integrations, limits: config.limits }))
        .digest('hex');
      return {
        catalog: {
          schemaVersion: 1,
          version,
          offerings: entries.map((entry) => entry.offering),
          limits: config.limits,
          clientPollIntervalMs: config.polling.clientIntervalMs,
          clientCatchUpIntervalMs: config.polling.clientCatchUpIntervalMs,
          integrations,
        },
        resolved: new Map(
          entries.map((entry) => [
            `${entry.offering.connectionId}:${entry.offering.modelId}`,
            entry,
          ]),
        ),
      };
    },
  };
}

export function selectMediaRoute(
  selected: ResolvedMediaOffering,
  providerTag?: string,
): ResolvedMediaOffering {
  if (!providerTag) return selected;
  const route = selected.offering.routes?.find((entry) => entry.providerTag === providerTag);
  if (!route)
    throw new MediaServiceError('unsupported', 422, 'This provider route is unavailable.');
  return {
    ...selected,
    providerTag,
    offering: { ...selected.offering, capabilities: route.capabilities },
  };
}

export function validateMediaOffering(
  request: MediaSubmissionRequest,
  offering: MediaOffering,
  limits?: MediaLimits,
): MediaCapability {
  const capability = offering.capabilities.find((entry) => entry.operation === request.operation);
  if (!offering.available || !capability) {
    throw new MediaServiceError('unsupported', 422, 'This operation is not available.');
  }
  if (
    request.inputs.length < capability.inputs.min ||
    request.inputs.length > capability.inputs.max ||
    request.inputs.some((input) => !capability.inputs.roles.includes(input.role)) ||
    capability.inputs.requiredRoles?.some(
      (role) => !request.inputs.some((input) => input.role === role),
    )
  ) {
    throw new MediaServiceError('unsupported', 422, 'These inputs are not supported.');
  }
  if (
    request.inputs.some(
      (input) =>
        capability.inputs.hostedRoles?.some((role) => role === input.role) && !input.sourceURL,
    )
  ) {
    throw new MediaServiceError(
      'invalid_request',
      422,
      'This input requires a hosted HTTPS media source.',
    );
  }
  type Parameters = MediaImageParameters & MediaVideoParameters;
  const controls: Partial<
    Record<keyof Parameters, MediaNumberControl | MediaEnumControl | boolean | string[]>
  > = capability.controls;
  for (const [name, control] of Object.entries(controls)) {
    if (
      control &&
      typeof control === 'object' &&
      !Array.isArray(control) &&
      'required' in control &&
      control.required &&
      !Object.entries(request.parameters).some(
        ([key, value]) => key === name && value !== undefined,
      )
    ) {
      throw new MediaServiceError('invalid_request', 422, `Choose a value for ${name}.`);
    }
  }
  for (const [name, value] of Object.entries(request.parameters)) {
    if (value === undefined) {
      continue;
    }
    const control = controls[name as keyof Parameters];
    if (control == null) {
      throw new MediaServiceError('unsupported', 422, `Unsupported parameter: ${name}`);
    }
    if (name === 'providerOptions') {
      if (!Array.isArray(control) || !limits || !request.parameters.providerOptions) {
        throw new MediaServiceError('unsupported', 422, 'Provider options are unavailable.');
      }
      const options = request.parameters.providerOptions;
      if (Object.keys(options).some((key) => !control.includes(key))) {
        throw new MediaServiceError('unsupported', 422, 'Unsupported provider options.');
      }
      const pending: Array<{ value: MediaOptionValue; depth: number }> = [
        { value: options, depth: 0 },
      ];
      while (pending.length) {
        const item = pending.pop()!;
        if (item.depth > limits.maxProviderOptionDepth)
          throw new MediaServiceError(
            'unsupported',
            422,
            'Provider options are too deeply nested.',
          );
        if (item.value && typeof item.value === 'object') {
          for (const child of Object.values(item.value))
            pending.push({ value: child, depth: item.depth + 1 });
        }
      }
      if (Buffer.byteLength(JSON.stringify(options)) > limits.maxProviderOptionBytes) {
        throw new MediaServiceError(
          'unsupported',
          422,
          'Provider options exceed the configured byte limit.',
        );
      }
      continue;
    }
    if (Array.isArray(control))
      throw new MediaServiceError('unsupported', 422, 'Unsupported parameter control.');
    if (name === 'negativePrompt') {
      if (
        control !== true ||
        typeof value !== 'string' ||
        (limits && value.length > limits.maxPromptChars)
      )
        throw new MediaServiceError('unsupported', 422, 'Unsupported negative prompt.');
      continue;
    }
    if (typeof control === 'boolean') {
      if (!control || typeof value !== 'boolean') {
        throw new MediaServiceError('unsupported', 422, 'Unsupported boolean parameter.');
      }
    } else if ('min' in control) {
      if (
        typeof value !== 'number' ||
        value < control.min ||
        value > control.max ||
        (control.values && !control.values.includes(value))
      ) {
        throw new MediaServiceError(
          'unsupported',
          422,
          'Parameter is outside the supported range.',
        );
      }
    } else if (!control.values.includes(String(value))) {
      throw new MediaServiceError('unsupported', 422, 'Unsupported parameter value.');
    }
  }
  if (
    request.operation !== 'video.generate' &&
    request.parameters.background === 'transparent' &&
    request.parameters.format === 'jpeg'
  ) {
    throw new MediaServiceError('unsupported', 422, 'JPEG cannot contain transparency.');
  }
  if (
    request.operation !== 'video.generate' &&
    request.parameters.size &&
    request.parameters.resolution
  ) {
    throw new MediaServiceError('unsupported', 422, 'Choose either size or resolution.');
  }
  if (
    request.operation === 'video.generate' &&
    request.parameters.size &&
    (request.parameters.resolution || request.parameters.aspectRatio)
  ) {
    throw new MediaServiceError(
      'unsupported',
      422,
      'Choose exact dimensions or a resolution and aspect ratio.',
    );
  }
  return capability;
}
