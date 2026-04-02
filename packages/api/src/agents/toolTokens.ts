import { SystemMessage } from '@langchain/core/messages';
import {
  Providers,
  toJsonSchema,
  ANTHROPIC_TOOL_TOKEN_MULTIPLIER,
  DEFAULT_TOOL_TOKEN_MULTIPLIER,
} from '@librechat/agents';
import { CacheKeys, Time } from 'librechat-data-provider';

import type { GenericTool, LCTool, TokenCounter, ClientOptions } from '@librechat/agents';
import type { Keyv } from 'keyv';

import { logger } from '@librechat/data-schemas';
import { standardCache } from '~/cache';

/** Module-level cache instance, lazily initialized. */
let toolTokenCache: Keyv | undefined;

function getCache(): Keyv {
  if (!toolTokenCache) {
    toolTokenCache = standardCache(CacheKeys.TOOL_TOKENS, Time.THIRTY_MINUTES);
  }
  return toolTokenCache;
}

export function getToolFingerprint(tools?: GenericTool[], toolDefinitions?: LCTool[]): string {
  const names = new Set<string>();

  if (tools) {
    for (const tool of tools) {
      const name = (tool as unknown as Record<string, unknown>).name;
      if (typeof name === 'string' && name) {
        names.add(name);
      }
    }
  }

  if (toolDefinitions) {
    for (const def of toolDefinitions) {
      if (def.name) {
        names.add(def.name);
      }
    }
  }

  if (names.size === 0) {
    return '';
  }

  const sorted = Array.from(names).sort();
  return sorted.join(',') + '|' + sorted.length;
}

function getToolTokenMultiplier(provider: Providers, clientOptions?: ClientOptions): number {
  const isAnthropic =
    provider !== Providers.BEDROCK &&
    (provider === Providers.ANTHROPIC ||
      /anthropic|claude/i.test(
        String((clientOptions as { model?: string } | undefined)?.model ?? ''),
      ));
  return isAnthropic ? ANTHROPIC_TOOL_TOKEN_MULTIPLIER : DEFAULT_TOOL_TOKEN_MULTIPLIER;
}

export function computeToolSchemaTokens(
  tools: GenericTool[] | undefined,
  toolDefinitions: LCTool[] | undefined,
  provider: Providers,
  clientOptions: ClientOptions | undefined,
  tokenCounter: TokenCounter,
): number {
  let toolTokens = 0;
  const countedToolNames = new Set<string>();

  if (tools && tools.length > 0) {
    for (const tool of tools) {
      const genericTool = tool as unknown as Record<string, unknown>;
      if (genericTool.schema != null && typeof genericTool.schema === 'object') {
        const toolName = (genericTool.name as string | undefined) ?? '';
        const jsonSchema = toJsonSchema(
          genericTool.schema,
          toolName,
          (genericTool.description as string | undefined) ?? '',
        );
        toolTokens += tokenCounter(new SystemMessage(JSON.stringify(jsonSchema)));
        if (toolName) {
          countedToolNames.add(toolName);
        }
      }
    }
  }

  if (toolDefinitions && toolDefinitions.length > 0) {
    for (const def of toolDefinitions) {
      if (countedToolNames.has(def.name)) {
        continue;
      }
      const schema = {
        type: 'function',
        function: {
          name: def.name,
          description: def.description ?? '',
          parameters: def.parameters ?? {},
        },
      };
      toolTokens += tokenCounter(new SystemMessage(JSON.stringify(schema)));
    }
  }

  const multiplier = getToolTokenMultiplier(provider, clientOptions);
  return Math.ceil(toolTokens * multiplier);
}

/**
 * Returns cached tool schema tokens or computes them on miss.
 * Returns 0 if there are no tools.
 * Cache errors are non-fatal — falls through to compute on read failure,
 * logs on write failure.
 */
export async function getOrComputeToolTokens({
  tools,
  toolDefinitions,
  provider,
  clientOptions,
  tokenCounter,
}: {
  tools?: GenericTool[];
  toolDefinitions?: LCTool[];
  provider: Providers;
  clientOptions?: ClientOptions;
  tokenCounter: TokenCounter;
}): Promise<number> {
  const fingerprint = getToolFingerprint(tools, toolDefinitions);
  if (!fingerprint) {
    return 0;
  }

  const multiplier = getToolTokenMultiplier(provider, clientOptions);
  const multiplierKey = multiplier === ANTHROPIC_TOOL_TOKEN_MULTIPLIER ? 'anthropic' : 'default';
  const cacheKey = `${provider}:${multiplierKey}:${fingerprint}`;
  const cache = getCache();

  try {
    const cached = (await cache.get(cacheKey)) as number | undefined;
    if (cached != null && cached > 0) {
      return cached;
    }
  } catch (err) {
    logger.debug('[toolTokens] Cache read failed, computing fresh', err);
  }

  const tokens = computeToolSchemaTokens(
    tools,
    toolDefinitions,
    provider,
    clientOptions,
    tokenCounter,
  );

  if (tokens > 0) {
    cache.set(cacheKey, tokens).catch((err: unknown) => {
      logger.debug('[toolTokens] Cache write failed', err);
    });
  }

  return tokens;
}
