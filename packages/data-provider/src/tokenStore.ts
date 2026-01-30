import { z } from 'zod';

export const tokenStoreBackendEnum = z.enum(['mongo', 'aws-parameter', 'aws-secrets']);

export type TokenStoreBackend = z.infer<typeof tokenStoreBackendEnum>;

export const tokenStoreAwsRetrySchema = z
  .object({
    maxAttempts: z.number().int().positive().default(3),
    backoffMs: z.number().int().nonnegative().default(200),
  })
  .partial();

export const tokenStoreAwsSchema = z
  .object({
    region: z.string().optional(),
    kmsKeyId: z.string().optional(),
    parameterPrefix: z.string().default('/librechat/{env}/mcp'),
    secretPrefix: z.string().default('/librechat/{env}/mcp'),
    retry: tokenStoreAwsRetrySchema.optional(),
  })
  .partial();

export type TAwsTokenStoreConfig = z.infer<typeof tokenStoreAwsSchema>;

export const tokenStoreConfigSchema = z.object({
  backend: tokenStoreBackendEnum.default('mongo'),
  encryptBeforeStore: z.boolean().default(true),
  aws: tokenStoreAwsSchema.optional(),
});

export type TTokenStoreConfig = z.infer<typeof tokenStoreConfigSchema>;

export const authConfigSchema = z.object({
  tokenStore: tokenStoreConfigSchema.optional(),
});

export type TAuthConfig = z.infer<typeof authConfigSchema>;
