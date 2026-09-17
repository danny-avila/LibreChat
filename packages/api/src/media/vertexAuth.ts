import { z } from 'zod';
import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { resolveMediaConfig } from 'librechat-data-provider';
import { MediaServiceError } from './errors';

interface VertexServiceAccount {
  type: 'service_account';
  project_id: string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

const projectIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const serviceAccountSchema: z.ZodType<VertexServiceAccount> = z.object({
  type: z.literal('service_account'),
  project_id: projectIdSchema,
  client_email: z.string().email(),
  private_key: z.string().min(1),
  private_key_id: z.string().optional(),
});

interface VertexTokenClient {
  credentials: { expiry_date?: number | null };
  eagerRefreshThresholdMillis: number;
  getAccessToken(): Promise<{ token?: string | null }>;
}

interface VertexAuthOptions {
  credentials: VertexServiceAccount;
  projectId: string;
  timeoutMs: number;
}

export type MediaVertexCredentialProvider = (input: {
  keyFile: string;
  projectId?: string;
  minValidityMs: number;
  timeoutMs: number;
}) => Promise<{ projectId: string; accessToken: string; revision: string }>;

/** Concrete SDK boundary; the host supplies it to the credential provider. */
export function createGoogleMediaAuthClient(options: VertexAuthOptions): {
  getClient(): Promise<VertexTokenClient>;
} {
  return new GoogleAuth({
    credentials: options.credentials,
    projectId: options.projectId,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    clientOptions: { transporterOptions: { timeout: options.timeoutMs } },
  });
}

/** Reuse renewable tokens, while binding saved jobs to the service account, not its token. */
export function createVertexMediaCredentialProvider({
  readFile,
  createAuth,
  now,
  maxCacheEntries,
}: {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  createAuth(options: VertexAuthOptions): { getClient(): Promise<VertexTokenClient> };
  now(): number;
  maxCacheEntries?: number;
}): MediaVertexCredentialProvider {
  const capacity = resolveMediaConfig({ catalog: { maxCacheEntries } }).catalog.maxCacheEntries;
  const cache = new Map<
    string,
    { revision: string; timeoutMs: number; client: Promise<VertexTokenClient> }
  >();
  return async ({ keyFile, projectId, minValidityMs, timeoutMs }) => {
    try {
      const credentials = serviceAccountSchema.parse(JSON.parse(await readFile(keyFile, 'utf8')));
      const project = projectIdSchema.parse(projectId ?? credentials.project_id);
      const revision = createHash('sha256').update(JSON.stringify(credentials)).digest('hex');
      const cacheKey = JSON.stringify([keyFile, project]);
      let cached = cache.get(cacheKey);
      if (!cached || cached.revision !== revision || cached.timeoutMs !== timeoutMs) {
        cached = {
          revision,
          timeoutMs,
          client: createAuth({ credentials, projectId: project, timeoutMs }).getClient(),
        };
      }
      cache.delete(cacheKey);
      cache.set(cacheKey, cached);
      while (cache.size > capacity) cache.delete(cache.keys().next().value!);
      let client: VertexTokenClient;
      try {
        client = await cached.client;
      } catch {
        if (cache.get(cacheKey) === cached) cache.delete(cacheKey);
        throw new MediaServiceError('credentials_required', 403, 'Vertex authentication failed.');
      }
      client.eagerRefreshThresholdMillis = Math.max(
        client.eagerRefreshThresholdMillis,
        minValidityMs,
      );
      const { token } = await client.getAccessToken();
      if (
        !token ||
        !client.credentials.expiry_date ||
        client.credentials.expiry_date <= now() + minValidityMs
      ) {
        throw new MediaServiceError(
          'credentials_expired',
          403,
          'The Vertex access token has expired.',
        );
      }
      return { projectId: project, accessToken: token, revision };
    } catch (error) {
      if (error instanceof MediaServiceError) throw error;
      // File and SDK errors can contain credential material; never surface their payloads.
      throw new MediaServiceError('credentials_required', 403, 'Vertex authentication failed.');
    }
  };
}
