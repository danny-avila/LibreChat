import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  LANGFUSE_PROMPT_CACHE_TTL_DEFAULT_MS,
  LANGFUSE_PROMPT_REQUEST_TIMEOUT_DEFAULT_MS,
} from 'librechat-data-provider';
import type { AgentInstructionPrompt } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type {
  AgentInstructionPromptContext,
  AgentInstructionPromptProvider,
  AgentInstructionPromptResult,
} from '~/agents/instructions';
import type { LangfuseScoreDestination } from './destinations';
import { AgentInstructionPromptError } from '~/agents/instructions';
import { mergeHeaders } from '~/utils/headers';
import { redirectPolicyFor } from './utils';

const destinationPreference: Record<LangfuseScoreDestination['name'], number> = {
  connection: 0,
  tenant: 1,
  central: 2,
};

const langfusePromptSchema = z.object({
  name: z.string().min(1),
  version: z.number().int().positive(),
  type: z.string(),
  prompt: z.unknown(),
});

type CacheEntry = {
  expiresAt: number;
  value: AgentInstructionPromptResult;
};

export interface LangfusePromptProviderDeps {
  resolveDestinations: (appConfig?: AppConfig) => Promise<LangfuseScoreDestination[]>;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  cacheTtlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

function isLangfuseReference(
  reference: AgentInstructionPrompt,
): reference is Extract<AgentInstructionPrompt, { source: 'langfuse' }> {
  return reference.source === 'langfuse';
}

function cacheKey(destination: LangfuseScoreDestination, name: string, version?: number): string {
  const headers = Object.entries(destination.headers ?? {})
    .map(([key, value]) => [key.toLowerCase(), value] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const identity = createHash('sha256')
    .update(`${destination.baseUrl}\n${destination.authorization}\n${JSON.stringify(headers)}`)
    .digest('hex');
  return `${identity}:${name}:${version ?? 'latest'}`;
}

function pruneExpiredEntries(
  cache: Map<string, CacheEntry>,
  currentKey: string,
  currentTime: number,
) {
  for (const [key, entry] of cache) {
    if (key !== currentKey && entry.expiresAt <= currentTime) {
      cache.delete(key);
    }
  }
}

function promptUrl(destination: LangfuseScoreDestination, name: string, version?: number): string {
  const params = new URLSearchParams(
    version == null ? { label: 'latest' } : { version: String(version) },
  );
  return `${destination.baseUrl.replace(/\/+$/, '')}/api/public/v2/prompts/${encodeURIComponent(name)}?${params.toString()}`;
}

function transientError(status: number): AgentInstructionPromptError {
  if (status === 429) {
    return new AgentInstructionPromptError(
      'retrieval_failed',
      'Langfuse is rate limiting prompt retrieval',
      503,
      true,
    );
  }
  return new AgentInstructionPromptError(
    'retrieval_failed',
    'Langfuse could not retrieve the selected prompt',
    502,
    true,
  );
}

function statusError(status: number): AgentInstructionPromptError {
  if (status === 401 || status === 403) {
    return new AgentInstructionPromptError(
      'access_denied',
      'Langfuse denied access to the selected prompt',
      403,
    );
  }
  if (status === 404) {
    return new AgentInstructionPromptError(
      'not_found',
      'The selected Langfuse prompt or version no longer exists',
      404,
    );
  }
  if (status === 429 || status >= 500) {
    return transientError(status);
  }
  return new AgentInstructionPromptError(
    'retrieval_failed',
    `Langfuse rejected prompt retrieval with status ${status}`,
    502,
  );
}

function parsePrompt(value: unknown): AgentInstructionPromptResult {
  const parsed = langfusePromptSchema.safeParse(value);
  if (!parsed.success) {
    throw new AgentInstructionPromptError(
      'invalid_response',
      'Langfuse returned an invalid prompt response',
      502,
    );
  }
  if (parsed.data.type !== 'text' || typeof parsed.data.prompt !== 'string') {
    throw new AgentInstructionPromptError(
      'unsupported_type',
      'Agent instructions require a Langfuse text prompt',
      422,
    );
  }
  if (parsed.data.prompt.trim() === '') {
    throw new AgentInstructionPromptError(
      'invalid_response',
      'The selected Langfuse prompt is empty',
      422,
    );
  }
  return {
    prompt: parsed.data.prompt,
    source: 'langfuse',
    name: parsed.data.name,
    version: parsed.data.version,
  };
}

export function createLangfusePromptProvider({
  resolveDestinations,
  fetch,
  cacheTtlMs = LANGFUSE_PROMPT_CACHE_TTL_DEFAULT_MS,
  timeoutMs = LANGFUSE_PROMPT_REQUEST_TIMEOUT_DEFAULT_MS,
  now = Date.now,
}: LangfusePromptProviderDeps): AgentInstructionPromptProvider {
  const cache = new Map<string, CacheEntry>();

  return {
    async resolve(reference, context: AgentInstructionPromptContext) {
      if (!isLangfuseReference(reference)) {
        throw new AgentInstructionPromptError(
          'unsupported_type',
          'The Langfuse provider cannot resolve a LibreChat prompt',
          422,
        );
      }
      const destinations = (await resolveDestinations(context.appConfig)).sort(
        (left, right) => destinationPreference[left.name] - destinationPreference[right.name],
      );
      const destination = destinations[0];
      if (!destination) {
        throw new AgentInstructionPromptError(
          'not_configured',
          'No Langfuse prompt connection is configured',
          503,
        );
      }

      const key = cacheKey(destination, reference.name, reference.version);
      const currentTime = now();
      pruneExpiredEntries(cache, key, currentTime);
      const cached = cache.get(key);
      if (cached && cached.expiresAt > currentTime) {
        return { ...cached.value, cached: true };
      }
      const promptConfig = context.appConfig?.langfuse?.prompts;
      const effectiveCacheTtlMs = promptConfig?.cacheTtlMs ?? cacheTtlMs;
      const effectiveTimeoutMs = promptConfig?.requestTimeoutMs ?? timeoutMs;
      const timeoutSignal = AbortSignal.timeout(effectiveTimeoutMs);
      const signal = context.signal
        ? AbortSignal.any([context.signal, timeoutSignal])
        : timeoutSignal;

      try {
        const response = await fetch(promptUrl(destination, reference.name, reference.version), {
          headers: mergeHeaders(destination.headers, {
            Authorization: destination.authorization,
          }),
          signal,
          ...redirectPolicyFor(destination.headers),
        });
        if (!response.ok) {
          throw statusError(response.status);
        }
        const result = parsePrompt(await response.json());
        cache.set(key, { value: result, expiresAt: now() + effectiveCacheTtlMs });
        return result;
      } catch (error) {
        if (context.signal?.aborted) {
          throw context.signal.reason ?? error;
        }
        const normalized =
          error instanceof AgentInstructionPromptError
            ? error
            : new AgentInstructionPromptError(
                'retrieval_failed',
                'Langfuse prompt retrieval failed',
                502,
                true,
              );
        if (normalized.retryable && cached) {
          return { ...cached.value, cached: true };
        }
        throw normalized;
      }
    },
  };
}
