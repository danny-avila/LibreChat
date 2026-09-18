import { z } from 'zod';
import {
  MEDIA_SCHEMA_VERSION,
  mediaApiSchema,
  mediaIdSchema,
  mediaOperationSchema,
} from './requests';
import { mediaLimitsSchema } from './capabilities';
import { fileStorageSchema } from '../storage';
import { EModelEndpoint } from '../schemas';

const milliseconds = z.number().int().positive().max(604_800_000);
const capacity = z.number().int().positive().max(1_000_000);
export const mediaIntegrationSchema = z
  .object({
    id: mediaIdSchema,
    label: z.string().trim().min(1).optional(),
    /** Omission preserves availability; false excludes new work while retaining job recovery. */
    enabled: z.boolean().optional(),
    api: mediaApiSchema,
    endpointRef: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('builtin'), endpoint: z.nativeEnum(EModelEndpoint) }).strict(),
      z.object({ kind: z.literal('custom'), name: z.string().trim().min(1) }).strict(),
      z
        .object({
          kind: z.literal('direct'),
          apiKey: z.string().min(1),
          baseURL: z.string().trim().min(1).optional(),
          credentialName: mediaIdSchema.optional(),
          headers: z.record(z.string(), z.string()).optional(),
          options: z.record(z.string(), z.string()).optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal('vertex'),
          keyFile: z.string().trim().min(1),
          projectId: z.string().trim().min(1).optional(),
          location: z
            .string()
            .regex(/^[a-z][a-z0-9-]*$/)
            .default('us-central1'),
        })
        .strict(),
    ]),
    catalog: z.discriminatedUnion('kind', [
      z
        .object({ kind: z.literal('configured'), models: z.array(mediaIdSchema).default([]) })
        .strict(),
      z
        .object({
          kind: z.literal('discovered'),
          allowModels: z.array(mediaIdSchema).default([]),
          allModels: z.boolean().default(false),
          excludeModels: z.array(mediaIdSchema).default([]),
        })
        .strict(),
    ]),
    operations: z.array(mediaOperationSchema).min(1),
    billing: z
      .object({
        creditsPerUSD: z.number().finite().positive(),
        estimatedCostUSD: z.number().finite().nonnegative().optional(),
        maxCostUSD: z.number().finite().positive().optional(),
      })
      .strict()
      .refine(
        (billing) =>
          billing.estimatedCostUSD === undefined ||
          billing.maxCostUSD === undefined ||
          billing.estimatedCostUSD <= billing.maxCostUSD,
        'Estimated cost cannot exceed the maximum',
      )
      .optional(),
  })
  .strict()
  .superRefine((integration, ctx) => {
    if (
      (integration.api === 'google.vertex.videos' && integration.endpointRef.kind !== 'vertex') ||
      (integration.endpointRef.kind === 'vertex' &&
        !['google.generateContent', 'google.vertex.videos'].includes(integration.api))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['endpointRef'],
        message: 'Vertex credentials require a supported native Google API',
      });
    }
    if (integration.endpointRef.kind === 'vertex' && integration.catalog.kind !== 'configured') {
      ctx.addIssue({
        code: 'custom',
        path: ['catalog'],
        message: 'Vertex media requires explicitly configured models',
      });
    }
    const videoOnly = integration.api.endsWith('.videos');
    const imageOnly =
      integration.api.endsWith('.images') || integration.api === 'google.generateContent';
    if (
      integration.operations.some((operation) =>
        videoOnly ? operation !== 'video.generate' : imageOnly && operation === 'video.generate',
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['operations'],
        message: 'Operation is incompatible with the API',
      });
    }
    if (new Set(integration.operations).size !== integration.operations.length) {
      ctx.addIssue({ code: 'custom', path: ['operations'], message: 'Operations must be unique' });
    }
  });

export const mediaConfigSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_SCHEMA_VERSION).default(MEDIA_SCHEMA_VERSION),
    enabled: z.boolean().default(false),
    surfaces: z
      .object({ studio: z.boolean().default(true), chat: z.boolean().default(true) })
      .strict()
      .default({}),
    integrations: z.array(mediaIntegrationSchema).default([]),
    limits: mediaLimitsSchema.default({}),
    accounting: z
      .object({
        maxHoldsPerUser: z.number().int().positive().max(10_000).default(128),
        maxAttempts: z.number().int().positive().max(1_000).default(20),
      })
      .strict()
      .default({}),
    catalog: z
      .object({
        refreshMs: milliseconds.default(900_000),
        requestTimeoutMs: milliseconds.default(10_000),
        maxResponseBytes: z.number().int().positive().max(104_857_600).default(10_485_760),
        maxConcurrentRequests: z.number().int().positive().max(100).default(4),
        maxModels: z.number().int().positive().max(10_000).default(256),
        maxCacheEntries: z.number().int().positive().max(10_000).default(256),
      })
      .strict()
      .default({}),
    queue: z
      .object({
        maxPendingPerUser: capacity.default(20),
        maxPendingTotal: capacity.default(200),
        maxQueueAgeMs: milliseconds.default(3_600_000),
      })
      .strict()
      .default({}),
    execution: z
      .object({
        maxActivePerUser: capacity.default(2),
        maxActivePerIntegration: capacity.default(4),
        maxActiveTotal: capacity.default(8),
      })
      .strict()
      .default({}),
    worker: z
      .object({
        tickMs: milliseconds.default(1_000),
        leaseMs: milliseconds.default(60_000),
        renewEveryMs: milliseconds.default(20_000),
        shutdownTimeoutMs: milliseconds.default(10_000),
      })
      .strict()
      .default({}),
    polling: z
      .object({
        providerIntervalMs: milliseconds.default(30_000),
        clientIntervalMs: milliseconds.default(5_000),
        clientCatchUpIntervalMs: milliseconds.default(30_000),
      })
      .strict()
      .default({}),
    timeouts: z
      .object({
        submitMs: milliseconds.default(300_000),
        pollRequestMs: milliseconds.default(10_000),
        downloadMs: milliseconds.default(120_000),
      })
      .strict()
      .default({}),
    recovery: z
      .object({ attentionAfterMs: milliseconds.default(86_400_000) })
      .strict()
      .default({}),
    credentials: z
      .object({ minValidityAtDispatchMs: milliseconds.default(60_000) })
      .strict()
      .default({}),
    transfers: z
      .object({
        maxImageBytes: z.number().int().positive().max(1_073_741_824).default(20_971_520),
        maxVideoBytes: z.number().int().positive().max(10_737_418_240).default(536_870_912),
        maxAudioBytes: z.number().int().positive().max(1_073_741_824).default(20_971_520),
        maxRedirects: z.number().int().nonnegative().max(10).default(3),
      })
      .strict()
      .default({}),
    assets: z
      .object({
        source: fileStorageSchema.nullable().default(null),
        retention: z.literal('inherit').default('inherit'),
        orphanRetentionMs: milliseconds.default(86_400_000),
      })
      .strict()
      .default({}),
    /**
     * LLM-generated Studio thread titles. A new thread first receives the prompt bounded to
     * `limits.maxTitleChars`; when a text model is configured, the server then asks it for a short
     * title in the background and replaces the prompt-derived one unless the user renamed the
     * thread first. `endpoint` falls back to `endpoints.all.titleEndpoint`, and `model` to
     * `endpoints.all.titleModel`, then the resolved endpoint's own `titleModel`. Without an
     * endpoint or model the prompt-derived title stands, so an unconfigured deployment keeps
     * today's behavior even though `enabled` defaults on.
     */
    titles: z
      .object({
        enabled: z.boolean().default(true),
        endpoint: z.string().trim().min(1).optional(),
        model: z.string().trim().min(1).optional(),
        prompt: z.string().trim().min(1).optional(),
        timeoutMs: milliseconds.default(45_000),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((config, ctx) => {
    const fail = (path: string[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (
      config.enabled &&
      !config.integrations.some((integration) =>
        integration.catalog.kind === 'configured'
          ? integration.catalog.models.length > 0
          : integration.catalog.allModels || integration.catalog.allowModels.length > 0,
      )
    ) {
      fail(
        ['integrations'],
        'Enabled media requires configured models, an allowlist, or explicit all-model discovery',
      );
    }
    if (
      new Set(config.integrations.map((integration) => integration.id)).size !==
      config.integrations.length
    ) {
      fail(['integrations'], 'Integration IDs must be unique');
    }
    const modelCount = config.integrations.reduce(
      (count, integration) =>
        count +
        (integration.catalog.kind === 'configured'
          ? integration.catalog.models.length
          : integration.catalog.allowModels.length),
      0,
    );
    if (modelCount > config.catalog.maxModels) {
      fail(['integrations'], 'Configured model offerings exceed the catalog limit');
    }
    if (config.worker.renewEveryMs >= config.worker.leaseMs) {
      fail(['worker', 'renewEveryMs'], 'Lease renewal must precede expiry');
    }
    if (
      config.execution.maxActivePerUser > config.execution.maxActiveTotal ||
      config.execution.maxActivePerIntegration > config.execution.maxActiveTotal
    ) {
      fail(['execution'], 'Scoped concurrency cannot exceed total concurrency');
    }
    if (config.queue.maxPendingPerUser > config.queue.maxPendingTotal) {
      fail(['queue'], 'Per-user backlog cannot exceed total backlog');
    }
    if (config.polling.clientIntervalMs > config.polling.clientCatchUpIntervalMs) {
      fail(['polling'], 'Catch-up polling cannot be faster than active polling');
    }
  });

export type MediaIntegration = z.infer<typeof mediaIntegrationSchema>;
export type MediaConfig = z.infer<typeof mediaConfigSchema>;
export type MediaConfigInput = z.input<typeof mediaConfigSchema>;

/** Parse once after effective configuration assembly; absence preserves disabled behavior. */
export function resolveMediaConfig(config?: MediaConfigInput): MediaConfig {
  return mediaConfigSchema.parse(config ?? {});
}
