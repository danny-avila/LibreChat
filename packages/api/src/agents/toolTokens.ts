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

function getToolTokenMultiplier(provider: Providers, clientOptions?: ClientOptions): number {
  const isAnthropic =
    provider !== Providers.BEDROCK &&
    (provider === Providers.ANTHROPIC ||
      /anthropic|claude/i.test(
        String((clientOptions as { model?: string } | undefined)?.model ?? ''),
      ));
  return isAnthropic ? ANTHROPIC_TOOL_TOKEN_MULTIPLIER : DEFAULT_TOOL_TOKEN_MULTIPLIER;
}

/**
 * Single pass over tools and toolDefinitions. Collects deduplicated sorted
 * tool names (for fingerprint) and pre-serialized schemas (for token
 * counting on cache miss), mirroring the dedup logic in
 * AgentContext.calculateInstructionTokens().
 */
function collectToolData(
  tools?: GenericTool[],
  toolDefinitions?: LCTool[],
): { names: string[]; schemas: string[] } {
  const nameSet = new Set<string>();
  const countedNames = new Set<string>();
  const schemas: string[] = [];

  if (tools) {
    for (const tool of tools) {
      const genericTool = tool as unknown as Record<string, unknown>;
      const toolName = (genericTool.name as string | undefined) ?? '';
      if (toolName) {
        nameSet.add(toolName);
      }
      if (genericTool.schema != null && typeof genericTool.schema === 'object') {
        schemas.push(
          JSON.stringify(
            toJsonSchema(
              genericTool.schema,
              toolName,
              (genericTool.description as string | undefined) ?? '',
            ),
          ),
        );
        if (toolName) {
          countedNames.add(toolName);
        }
      }
    }
  }

  if (toolDefinitions) {
    for (const def of toolDefinitions) {
      if (def.name) {
        nameSet.add(def.name);
      }
      if (countedNames.has(def.name)) {
        continue;
      }
      schemas.push(
        JSON.stringify({
          type: 'function',
          function: {
            name: def.name,
            description: def.description ?? '',
            parameters: def.parameters ?? {},
          },
        }),
      );
    }
  }

  const names = nameSet.size > 0 ? Array.from(nameSet).sort() : [];
  return { names, schemas };
}

export function getToolFingerprint(tools?: GenericTool[], toolDefinitions?: LCTool[]): string {
  const { names } = collectToolData(tools, toolDefinitions);
  if (names.length === 0) {
    return '';
  }
  return names.join(',') + '|' + names.length;
}

export function computeToolSchemaTokens(
  tools: GenericTool[] | undefined,
  toolDefinitions: LCTool[] | undefined,
  provider: Providers,
  clientOptions: ClientOptions | undefined,
  tokenCounter: TokenCounter,
): number {
  const { schemas } = collectToolData(tools, toolDefinitions);
  let toolTokens = 0;
  for (const schema of schemas) {
    toolTokens += tokenCounter(new SystemMessage(schema));
  }
  const multiplier = getToolTokenMultiplier(provider, clientOptions);
  return Math.ceil(toolTokens * multiplier);
}

/**
 * Returns cached tool schema tokens or computes them on miss.
 * Returns 0 if there are no tools.
 * Single pass over tool arrays: builds fingerprint and serialized schemas
 * together, then only runs the token counter if the cache misses.
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
  const { names, schemas } = collectToolData(tools, toolDefinitions);
  if (names.length === 0) {
    return 0;
  }

  const fingerprint = names.join(',') + '|' + names.length;
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

  let toolTokens = 0;
  for (const schema of schemas) {
    toolTokens += tokenCounter(new SystemMessage(schema));
  }
  const tokens = Math.ceil(toolTokens * multiplier);

  if (tokens > 0) {
    cache.set(cacheKey, tokens).catch((err: unknown) => {
      logger.debug('[toolTokens] Cache write failed', err);
    });
  }

  return tokens;
}
