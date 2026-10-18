import { z } from 'zod';
import { requireAllSectionCapabilities } from './capabilities';
import { apiFetch, extractApiError } from './utils/api';
import { createServerFn } from '~/admin/api/utils/fn';

export interface LangfuseDestinationOption {
  key: string;
  baseUrl: string;
}

export interface LangfuseConnectionStatus {
  configured: boolean;
  enabled: boolean;
  destinations: LangfuseDestinationOption[];
  destination?: string;
  publicKey?: string;
  displaySecretKey?: string;
  updatedAt?: string;
}

export interface LangfuseConnectionTestResponse {
  success: boolean;
  message?: string;
}

export const LANGFUSE_CONNECTION_QUERY_KEY = ['adminLangfuseConnection'] as const;

const connectionInputSchema = z.object({
  enabled: z.boolean(),
  destination: z.string(),
  publicKey: z.string(),
  secretKey: z.string().optional(),
});

const connectionTestInputSchema = connectionInputSchema.omit({ enabled: true });

/**
 * Proxy the dedicated LibreChat Langfuse connection API. LibreChat owns the
 * destination allowlist, encrypted-secret handling, and credential checks.
 */
export const getLangfuseConnectionFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<LangfuseConnectionStatus> => {
    await requireAllSectionCapabilities(['langfuse']);
    const response = await apiFetch('/api/admin/langfuse/connection');
    if (!response.ok) {
      return extractApiError(response, 'Failed to read Langfuse connection');
    }
    return (await response.json()) as LangfuseConnectionStatus;
  },
);

export const updateLangfuseConnectionFn = createServerFn({ method: 'POST' })
  .inputValidator(connectionInputSchema)
  .handler(async ({ data }): Promise<LangfuseConnectionStatus> => {
    await requireAllSectionCapabilities(['langfuse']);
    const response = await apiFetch('/api/admin/langfuse/connection', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      return extractApiError(response, 'Failed to update Langfuse connection');
    }
    return (await response.json()) as LangfuseConnectionStatus;
  });

export const testLangfuseConnectionFn = createServerFn({ method: 'POST' })
  .inputValidator(connectionTestInputSchema)
  .handler(async ({ data }): Promise<LangfuseConnectionTestResponse> => {
    await requireAllSectionCapabilities(['langfuse']);
    const response = await apiFetch('/api/admin/langfuse/connection/test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      return extractApiError(response, 'Failed to verify Langfuse connection');
    }
    return (await response.json()) as LangfuseConnectionTestResponse;
  });
