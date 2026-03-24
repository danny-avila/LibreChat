import { SystemMessage } from '@langchain/core/messages';
import {
  Providers,
  toJsonSchema,
  ANTHROPIC_TOOL_TOKEN_MULTIPLIER,
  DEFAULT_TOOL_TOKEN_MULTIPLIER,
} from '@librechat/agents';
import { CacheKeys, Time } from 'librechat-data-provider';
import { standardCache } from '~/cache';
import type { Keyv } from 'keyv';
import type { GenericTool, LCTool, TokenCounter, ClientOptions } from '@librechat/agents';

/** Module-level cache instance, lazily initialized. */
let toolTokenCache: Keyv | undefined;

function getCache(): Keyv {
  if (!toolTokenCache) {
    toolTokenCache = standardCache(CacheKeys.TOOL_TOKENS, Time.THIRTY_MINUTES);
  }
  return toolTokenCache;
}

/**
 * Builds a lightweight fingerprint from tool names.
 * Sorted and deduplicated to ensure stability regardless of tool ordering.
 */
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

/**
 * Determines the provider-specific token multiplier for tool schemas.
 */
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
 * Computes tool schema tokens from scratch using the provided token counter.
 * Mirrors the logic in AgentContext.calculateInstructionTokens().
 */
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
 * Returns cached tool schema tokens if the fingerprint matches,
 * otherwise computes them, caches the result (fire-and-forget), and returns.
 *
 * Returns 0 if there are no tools (no caching needed).
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

  const cacheKey = `${provider}:${fingerprint}`;
  const cache = getCache();

  const cached = (await cache.get(cacheKey)) as number | undefined;
  if (cached != null && cached > 0) {
    return cached;
  }

  const tokens = computeToolSchemaTokens(
    tools,
    toolDefinitions,
    provider,
    clientOptions,
    tokenCounter,
  );

  if (tokens > 0) {
    /** Fire-and-forget write — don't block the run on cache persistence */
    cache.set(cacheKey, tokens).catch(() => {
      /* swallow cache write errors */
    });
  }

  return tokens;
}
