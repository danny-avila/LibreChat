import { z } from 'zod';
import {
  MEDIA_SCHEMA_VERSION,
  mediaApiSchema,
  mediaIdSchema,
  mediaInputRoleSchema,
  mediaHostedInputRoleSchema,
} from './requests';
import { mediaErrorCodeSchema } from './responses';

export const mediaNumberControlSchema = z
  .object({
    min: z.number().finite(),
    max: z.number().finite(),
    default: z.number().finite().optional(),
    values: z.array(z.number().finite()).min(1).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.min <= value.max &&
      (value.default === undefined || (value.default >= value.min && value.default <= value.max)) &&
      (!value.values ||
        (value.values.every((item) => item >= value.min && item <= value.max) &&
          (value.default === undefined || value.values.includes(value.default)))),
    'Invalid control range',
  );
export const mediaEnumControlSchema = z
  .object({
    values: z.array(z.string().min(1)).min(1),
    default: z.string().optional(),
    required: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.default === undefined || value.values.includes(value.default),
    'Default must be an available value',
  );
export const mediaImageControlsSchema = z
  .object({
    count: mediaNumberControlSchema.optional(),
    size: mediaEnumControlSchema.optional(),
    resolution: mediaEnumControlSchema.optional(),
    aspectRatio: mediaEnumControlSchema.optional(),
    quality: mediaEnumControlSchema.optional(),
    format: mediaEnumControlSchema.optional(),
    background: mediaEnumControlSchema.optional(),
    seed: mediaNumberControlSchema.optional(),
    outputCompression: mediaNumberControlSchema.optional(),
    strength: mediaNumberControlSchema.optional(),
    guidance: mediaNumberControlSchema.optional(),
    negativePrompt: z.boolean().optional(),
    providerOptions: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();
export const mediaVideoControlsSchema = z
  .object({
    count: mediaNumberControlSchema.optional(),
    durationSeconds: mediaNumberControlSchema.optional(),
    aspectRatio: mediaEnumControlSchema.optional(),
    resolution: mediaEnumControlSchema.optional(),
    size: mediaEnumControlSchema.optional(),
    audio: z.boolean().optional(),
    seed: mediaNumberControlSchema.optional(),
    upscaleFactor: mediaNumberControlSchema.optional(),
    creativity: mediaNumberControlSchema.optional(),
    negativePrompt: z.boolean().optional(),
    providerOptions: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();
export const mediaExecutionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('direct'), previews: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal('remote-job'),
      cancellation: z.enum(['unsupported', 'best-effort', 'confirmed']),
    })
    .strict(),
  z
    .object({ kind: z.literal('conversation'), continuation: z.enum(['replay', 'remote-id']) })
    .strict(),
]);
export const mediaParameterNameSchema = z.enum([
  'count',
  'size',
  'resolution',
  'aspectRatio',
  'quality',
  'format',
  'background',
  'seed',
  'outputCompression',
  'strength',
  'guidance',
  'negativePrompt',
  'providerOptions',
  'durationSeconds',
  'audio',
  'upscaleFactor',
  'creativity',
]);
export const mediaConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('input'), role: mediaInputRoleSchema, present: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal('parameter'),
      name: mediaParameterNameSchema,
      option: z.string().min(1).optional(),
      present: z.boolean().optional(),
      values: z
        .array(z.union([z.string(), z.number().finite(), z.boolean()]))
        .min(1)
        .optional(),
    })
    .strict(),
]);
/** All conditions in `when` imply at least one condition in `anyOf`. */
export const mediaConstraintSchema = z
  .object({
    when: z.array(mediaConditionSchema).optional(),
    anyOf: z.array(mediaConditionSchema).min(1),
  })
  .strict();
const capabilityFields = {
  constraints: z.array(mediaConstraintSchema).optional(),
  inputs: z
    .object({
      roles: z.array(mediaInputRoleSchema),
      min: z.number().int().nonnegative(),
      max: z.number().int().nonnegative(),
      requiredRoles: z.array(mediaInputRoleSchema).optional(),
      hostedRoles: z.array(mediaHostedInputRoleSchema).optional(),
    })
    .strict()
    .refine((value) => value.min <= value.max, 'Invalid input limits'),
  execution: mediaExecutionSchema,
  workflow: z.enum(['generate', 'edit', 'upscale', 'avatar']).optional(),
};
export const mediaCapabilitySchema = z.discriminatedUnion('operation', [
  z
    .object({
      ...capabilityFields,
      operation: z.literal('image.generate'),
      controls: mediaImageControlsSchema,
    })
    .strict(),
  z
    .object({
      ...capabilityFields,
      operation: z.literal('image.edit'),
      controls: mediaImageControlsSchema,
    })
    .strict(),
  z
    .object({
      ...capabilityFields,
      operation: z.literal('video.generate'),
      controls: mediaVideoControlsSchema,
    })
    .strict(),
]);
export const mediaOfferingSchema = z
  .object({
    connectionId: mediaIdSchema,
    connectionName: z.string(),
    modelId: mediaIdSchema,
    modelName: z.string(),
    api: mediaApiSchema,
    available: z.boolean(),
    unavailableReason: mediaErrorCodeSchema.optional(),
    capabilities: z.array(mediaCapabilitySchema),
    routes: z
      .array(
        z
          .object({
            providerTag: mediaIdSchema,
            providerName: z.string(),
            capabilities: z.array(mediaCapabilitySchema),
          })
          .strict(),
      )
      .optional(),
    defaultProviderTag: mediaIdSchema.optional(),
  })
  .strict();
export const mediaLimitsSchema = z
  .object({
    maxPromptChars: z.number().int().positive().max(1_000_000).default(32_000),
    maxTitleChars: z.number().int().positive().max(10_000).default(200),
    maxInputs: z.number().int().positive().max(1_000).default(16),
    maxOutputs: z.number().int().positive().max(1_000).default(8),
    pageSize: z.number().int().positive().max(1_000).default(24),
    maxPageSize: z.number().int().positive().max(1_000).default(100),
    maxAssetRetainers: z.number().int().positive().max(10_000).default(128),
    maxNativeParts: z.number().int().positive().max(4_096).default(1_024),
    maxNativePartBytes: z.number().int().positive().max(16_777_216).default(1_048_576),
    maxNativeRecordingBytes: z.number().int().positive().max(4_194_304).default(4_194_304),
    maxProviderOptionBytes: z.number().int().positive().max(1_048_576).default(32_768),
    maxProviderOptionDepth: z.number().int().positive().max(32).default(8),
    maxPresets: z.number().int().positive().max(1_000).default(50),
  })
  .strict()
  .refine((value) => value.pageSize <= value.maxPageSize, 'Page size exceeds maximum');

/** Public setup instructions only; saved credential values never belong in the catalog. */
export const mediaUserKeySchema = z
  .object({
    keyName: z.string().min(1),
    encoding: z.enum(['google', 'apiKey']),
    userProvideURL: z.boolean(),
  })
  .strict();

export const mediaCatalogSchema = z
  .object({
    schemaVersion: z.literal(MEDIA_SCHEMA_VERSION),
    version: mediaIdSchema,
    offerings: z.array(mediaOfferingSchema),
    limits: mediaLimitsSchema,
    clientPollIntervalMs: z.number().int().positive(),
    clientCatchUpIntervalMs: z.number().int().positive(),
    integrations: z
      .array(
        z
          .object({
            connectionId: mediaIdSchema,
            connectionName: z.string(),
            api: mediaApiSchema,
            available: z.boolean(),
            unavailableReason: mediaErrorCodeSchema.optional(),
            userKey: mediaUserKeySchema.optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export type MediaNumberControl = z.infer<typeof mediaNumberControlSchema>;
export type MediaEnumControl = z.infer<typeof mediaEnumControlSchema>;
export type MediaCapability = z.infer<typeof mediaCapabilitySchema>;
export type MediaOffering = z.infer<typeof mediaOfferingSchema>;
export type MediaCatalog = z.infer<typeof mediaCatalogSchema>;
export type MediaLimits = z.infer<typeof mediaLimitsSchema>;
export type MediaUserKey = z.infer<typeof mediaUserKeySchema>;
export type MediaCondition = z.infer<typeof mediaConditionSchema>;
export type MediaParameterName = z.infer<typeof mediaParameterNameSchema>;
