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
} from 'librechat-data-provider';
import type { MediaTransport, MediaTransportRequest } from './transport';
import type { MediaConnection, MediaProviderAdapter } from './provider';
import { mediaRouteAllowed, mediaRoutePriority, mediaVideoPolicySupported } from './routing';
import { vertexVideoCapabilities, vertexVideoModelName } from './adapters/vertexVideo';
import { MediaServiceError } from './errors';
import { mediaAPIURL } from './provider';

const descriptor = z.discriminatedUnion('type', [
  z.object({ type: z.literal('enum'), values: z.array(z.union([z.string(), z.number()])) }),
  z.object({ type: z.literal('range'), min: z.number(), max: z.number() }),
  z.object({ type: z.literal('boolean') }),
]);
const parameterSchema = z.object({
  n: descriptor.optional(),
  input_references: descriptor.optional(),
  size: descriptor.optional(),
  aspect_ratio: descriptor.optional(),
  resolution: descriptor.optional(),
  quality: descriptor.optional(),
  output_format: descriptor.optional(),
  background: descriptor.optional(),
  seed: descriptor.optional(),
});
const imageEndpointsSchema = z.object({
  id: z.string(),
  endpoints: z.array(
    z.object({
      provider_tag: z.string().nullable().optional(),
      supported_parameters: parameterSchema,
    }),
  ),
});
const videoCatalogSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      supported_durations: z.array(z.number()).nullable().optional(),
      supported_resolutions: z.array(z.string()).nullable().optional(),
      supported_aspect_ratios: z.array(z.string()).nullable().optional(),
      supported_frame_images: z.array(z.string()).nullable().optional(),
      generate_audio: z.boolean().nullable().optional(),
      seed: z.boolean().nullable().optional(),
      upscale_factor: z.object({ min: z.number(), max: z.number() }).nullable().optional(),
    }),
  ),
});

type ResolvedOffering = { offering: MediaOffering; providerTag?: string; bindingRevision?: string };
type MediaCatalogSnapshot = { catalog: MediaCatalog; resolved: Map<string, ResolvedOffering> };

function enumControl(value?: z.infer<typeof descriptor>) {
  return value?.type === 'enum' && value.values.length
    ? { values: value.values.map(String) }
    : undefined;
}

function numberControl(value?: z.infer<typeof descriptor>) {
  if (value?.type === 'range') {
    return { min: value.min, max: value.max };
  }
  if (
    value?.type === 'enum' &&
    value.values.length &&
    value.values.every((entry) => typeof entry === 'number')
  ) {
    const values = value.values.map(Number);
    return { min: Math.min(...values), max: Math.max(...values), values };
  }
  return undefined;
}

function imageCapabilities(
  parameters: z.infer<typeof parameterSchema>,
  integration: MediaIntegration,
  config: MediaConfig,
  modelId: string,
): MediaCapability[] {
  const reference = numberControl(parameters.input_references);
  const format = enumControl(parameters.output_format);
  if (format && !format.values.some((value) => ['png', 'jpeg', 'webp'].includes(value))) {
    return [];
  }
  const resolution = enumControl(parameters.resolution);
  if (modelId === 'bytedance-seed/seedream-4.5' && resolution) {
    // OpenRouter advertises 1K, but Seedream 4.5 rejects fewer than 3,686,400 pixels.
    // This is a provider constraint, not a configurable deployment limit.
    resolution.values = resolution.values.filter((value) => value !== '1K');
    if (!resolution.values.length) return [];
  }
  const controls = {
    count: numberControl(parameters.n) ?? { min: 1, max: 1 },
    size: enumControl(parameters.size),
    resolution,
    aspectRatio: enumControl(parameters.aspect_ratio),
    quality: enumControl(parameters.quality),
    format: format
      ? { values: format.values.filter((value) => ['png', 'jpeg', 'webp'].includes(value)) }
      : undefined,
    background: enumControl(parameters.background),
    seed: parameters.seed
      ? (numberControl(parameters.seed) ?? { min: 0, max: 2_147_483_647 })
      : undefined,
  };
  controls.count.max = Math.min(controls.count.max, config.limits.maxOutputs);
  if (controls.count.values) {
    controls.count.values = controls.count.values.filter((value) => value <= controls.count.max);
  }
  if (controls.count.min > controls.count.max || controls.count.values?.length === 0) {
    return [];
  }
  return integration.operations.flatMap((operation): MediaCapability[] => {
    if (
      operation === 'video.generate' ||
      (operation === 'image.edit' && (!reference || reference.max < 1))
    ) {
      return [];
    }
    const min = Math.max(reference?.min ?? 0, operation === 'image.edit' ? 1 : 0);
    const max = Math.min(reference?.max ?? 0, config.limits.maxInputs);
    if (min > max) {
      return [];
    }
    return [
      {
        operation,
        controls,
        inputs: { roles: max ? ['reference'] : [], min, max },
        execution: { kind: 'direct', previews: false },
      },
    ];
  });
}

function nativeCapabilities(
  integration: MediaIntegration,
  modelId: string,
  config: MediaConfig,
): MediaCapability[] {
  if (integration.api === 'google.vertex.videos') {
    return vertexVideoCapabilities(modelId, config);
  }
  if (integration.api === 'openai.images' && modelId.startsWith('gpt-image-')) {
    return integration.operations.flatMap((operation): MediaCapability[] =>
      operation === 'video.generate'
        ? []
        : [
            {
              operation,
              inputs: {
                roles: operation === 'image.edit' ? ['reference', 'mask'] : [],
                min: operation === 'image.edit' ? 1 : 0,
                max: operation === 'image.edit' ? Math.min(16, config.limits.maxInputs) : 0,
              },
              execution: { kind: 'direct', previews: false },
              controls: {
                count: { min: 1, max: Math.min(10, config.limits.maxOutputs) },
                quality: { values: ['auto', 'low', 'medium', 'high'] },
                format: { values: ['png', 'jpeg', 'webp'] },
                background: { values: ['auto', 'opaque', 'transparent'] },
                size: { values: ['auto', '1024x1024', '1536x1024', '1024x1536'] },
              },
            },
          ],
    );
  }
  if (integration.api === 'google.generateContent' && /^gemini-.*image/.test(modelId)) {
    return integration.operations.flatMap((operation): MediaCapability[] =>
      operation === 'video.generate'
        ? []
        : [
            {
              operation,
              inputs: {
                roles: ['reference'],
                min: operation === 'image.edit' ? 1 : 0,
                max: Math.min(3, config.limits.maxInputs),
              },
              execution: { kind: 'conversation', continuation: 'replay' },
              controls: {
                count: { min: 1, max: 1 },
                aspectRatio: {
                  values: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
                },
              },
            },
          ],
    );
  }
  if (integration.api === 'openai.videos' && /^sora-2(?:-pro)?$/.test(modelId)) {
    return [
      {
        operation: 'video.generate',
        inputs: { roles: ['start_frame'], min: 0, max: 1 },
        execution: { kind: 'remote-job', cancellation: 'unsupported' },
        controls: {
          count: { min: 1, max: 1 },
          durationSeconds: { min: 4, max: 12, values: [4, 8, 12] },
          resolution: { values: ['720x1280', '1280x720'] },
        },
      },
    ];
  }
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
    const models =
      integration.catalog.kind === 'configured'
        ? integration.catalog.models
        : integration.catalog.allowModels;
    const video =
      integration.api === 'openrouter.videos'
        ? await discover(
            {
              url: mediaAPIURL(connection, 'videos/models'),
              headers: connection.headers,
              timeoutMs: config.catalog.requestTimeoutMs,
              maxBytes: config.catalog.maxResponseBytes,
            },
            videoCatalogSchema,
            config,
          )
        : undefined;
    const entries: ResolvedOffering[] = [];
    const selected = models.slice(0, config.catalog.maxModels);
    for (let offset = 0; offset < selected.length; offset += config.catalog.maxConcurrentRequests) {
      const batch = await Promise.all(
        selected
          .slice(offset, offset + config.catalog.maxConcurrentRequests)
          .map(async (modelId) => {
            let capabilities = nativeCapabilities(integration, modelId, config);
            let providerTag: string | undefined;
            let modelName =
              integration.api === 'google.vertex.videos'
                ? (vertexVideoModelName(modelId) ?? modelId)
                : modelId;
            if (integration.api === 'openrouter.images') {
              const endpoints = await discover(
                {
                  url: mediaAPIURL(
                    connection,
                    `images/models/${modelId.split('/').map(encodeURIComponent).join('/')}/endpoints`,
                  ),
                  headers: connection.headers,
                  timeoutMs: config.catalog.requestTimeoutMs,
                  maxBytes: config.catalog.maxResponseBytes,
                },
                imageEndpointsSchema,
                config,
              );
              if (endpoints.id !== modelId) {
                throw new MediaServiceError('not_ready', 422, 'The catalog model does not match.');
              }
              const endpoint = endpoints.endpoints
                .filter(
                  (item) =>
                    (item.provider_tag != null || endpoints.endpoints.length === 1) &&
                    mediaRouteAllowed(item.provider_tag ?? undefined, connection.routing),
                )
                .sort(
                  (a, b) =>
                    mediaRoutePriority(a.provider_tag ?? undefined, connection.routing) -
                    mediaRoutePriority(b.provider_tag ?? undefined, connection.routing),
                )
                .find(
                  (item) =>
                    imageCapabilities(item.supported_parameters, integration, config, modelId)
                      .length > 0,
                );
              if (endpoint) {
                providerTag = endpoint.provider_tag ?? undefined;
                capabilities = imageCapabilities(
                  endpoint.supported_parameters,
                  integration,
                  config,
                  modelId,
                );
              }
            }
            const entry = video?.data.find((item) => item.id === modelId);
            if (entry) {
              modelName = entry.name ?? modelId;
            }
            if (
              entry?.supported_durations?.length &&
              !entry.upscale_factor &&
              mediaVideoPolicySupported(connection.routing)
            ) {
              const roles: Array<'start_frame' | 'end_frame'> = [];
              if (entry.supported_frame_images?.includes('first_frame')) {
                roles.push('start_frame');
              }
              if (entry.supported_frame_images?.includes('last_frame')) {
                roles.push('end_frame');
              }
              capabilities = [
                {
                  operation: 'video.generate',
                  inputs: { roles, min: 0, max: roles.length },
                  execution: { kind: 'remote-job', cancellation: 'unsupported' },
                  controls: {
                    count: { min: 1, max: 1 },
                    durationSeconds: entry.supported_durations?.length
                      ? {
                          min: Math.min(...entry.supported_durations),
                          max: Math.max(...entry.supported_durations),
                          values: entry.supported_durations,
                        }
                      : undefined,
                    resolution: entry.supported_resolutions?.length
                      ? { values: entry.supported_resolutions }
                      : undefined,
                    aspectRatio: entry.supported_aspect_ratios?.length
                      ? { values: entry.supported_aspect_ratios }
                      : undefined,
                    // This flag advertises audio output; Sora always includes audio, without a toggle.
                    audio:
                      (entry.generate_audio && !modelId.startsWith('openai/sora-')) || undefined,
                    seed: entry.seed ? { min: 0, max: 2_147_483_647 } : undefined,
                  },
                },
              ];
            }
            return {
              providerTag,
              bindingRevision: connection.binding,
              offering: {
                connectionId: integration.id,
                connectionName: integration.label ?? integration.id,
                modelId,
                modelName,
                api: integration.api,
                available: capabilities.length > 0,
                capabilities,
                ...(!capabilities.length ? { unavailableReason: 'unsupported' as const } : {}),
              },
            };
          }),
      );
      entries.push(...batch);
    }
    return entries;
  }

  return {
    async read(
      config: MediaConfig,
      resolve: (integration: MediaIntegration) => Promise<MediaConnection>,
      scope: string,
    ): Promise<MediaCatalogSnapshot> {
      const results = await Promise.all(
        config.integrations.map(async (integration): Promise<ResolvedOffering[]> => {
          const models =
            integration.catalog.kind === 'configured'
              ? integration.catalog.models
              : integration.catalog.allowModels;
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
      const version = createHash('sha256')
        .update(JSON.stringify({ scope, entries, limits: config.limits }))
        .digest('hex');
      return {
        catalog: {
          schemaVersion: 1,
          version,
          offerings: entries.map((entry) => entry.offering),
          limits: config.limits,
          clientPollIntervalMs: config.polling.clientIntervalMs,
          clientCatchUpIntervalMs: config.polling.clientCatchUpIntervalMs,
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

export function validateMediaOffering(
  request: MediaSubmissionRequest,
  offering: MediaOffering,
): MediaCapability {
  const capability = offering.capabilities.find((entry) => entry.operation === request.operation);
  if (!offering.available || !capability) {
    throw new MediaServiceError('unsupported', 422, 'This operation is not available.');
  }
  if (
    request.inputs.length < capability.inputs.min ||
    request.inputs.length > capability.inputs.max ||
    request.inputs.some((input) => !capability.inputs.roles.includes(input.role))
  ) {
    throw new MediaServiceError('unsupported', 422, 'These inputs are not supported.');
  }
  type Parameters = MediaImageParameters & MediaVideoParameters;
  const controls: Partial<
    Record<keyof Parameters, MediaNumberControl | MediaEnumControl | boolean>
  > = capability.controls;
  for (const [name, value] of Object.entries(request.parameters)) {
    if (value === undefined) {
      continue;
    }
    const control = controls[name as keyof Parameters];
    if (control == null) {
      throw new MediaServiceError('unsupported', 422, `Unsupported parameter: ${name}`);
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
  return capability;
}
