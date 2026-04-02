import { logger } from '@librechat/data-schemas';
import { SystemMessage } from '@langchain/core/messages';
import { CacheKeys, Time } from 'librechat-data-provider';
import {
  Providers,
  toJsonSchema,
  ANTHROPIC_TOOL_TOKEN_MULTIPLIER,
  DEFAULT_TOOL_TOKEN_MULTIPLIER,
} from '@librechat/agents';

import type { GenericTool, LCTool, TokenCounter, ClientOptions } from '@librechat/agents';
import type { Keyv } from 'keyv';

import { standardCache } from '~/cache';

/** Module-level cache instance, lazily initialized. */
let toolTokenCache: Keyv | undefined;

function getCache(): Keyv {
  if (!toolTokenCache) {
    toolTokenCache = standardCache(CacheKeys.TOOL_TOKENS, Time.THIRTY_MINUTES);
  }
  return toolTokenCache;
}

export function getToolTokenMultiplier(provider: Providers, clientOptions?: ClientOptions): number {
  const isAnthropic =
    provider !== Providers.BEDROCK &&
    (provider === Providers.ANTHROPIC ||
      /anthropic|claude/i.test(
        String((clientOptions as { model?: string } | undefined)?.model ?? ''),
      ));
  return isAnthropic ? ANTHROPIC_TOOL_TOKEN_MULTIPLIER : DEFAULT_TOOL_TOKEN_MULTIPLIER;
}

/** Serializes a GenericTool to a JSON string for token counting. Returns null if no schema. */
function serializeGenericTool(tool: GenericTool): { name: string; json: string } | null {
  const genericTool = tool as unknown as Record<string, unknown>;
  const toolName = (genericTool.name as string | undefined) ?? '';
  if (genericTool.schema == null || typeof genericTool.schema !== 'object') {
    return null;
  }
  const jsonSchema = toJsonSchema(
    genericTool.schema,
    toolName,
    (genericTool.description as string | undefined) ?? '',
  );
  return { name: toolName, json: JSON.stringify(jsonSchema) };
}

/** Serializes an LCTool definition to a JSON string for token counting. */
function serializeToolDef(def: LCTool): string {
  return JSON.stringify({
    type: 'function',
    function: {
      name: def.name,
      description: def.description ?? '',
      parameters: def.parameters ?? {},
    },
  });
}

/**
 * Builds a map of tool name → serialized schema JSON. Deduplicates: a tool
 * present in `tools` (with a schema) takes precedence over a matching
 * `toolDefinitions` entry, mirroring AgentContext.calculateInstructionTokens().
 */
export function collectToolSchemas(
  tools?: GenericTool[],
  toolDefinitions?: LCTool[],
): Map<string, string> {
  const schemas = new Map<string, string>();

  if (tools) {
    for (const tool of tools) {
      const result = serializeGenericTool(tool);
      if (result && result.name) {
        schemas.set(result.name, result.json);
      }
    }
  }

  if (toolDefinitions) {
    for (const def of toolDefinitions) {
      if (!def.name || schemas.has(def.name)) {
        continue;
      }
      schemas.set(def.name, serializeToolDef(def));
    }
  }

  return schemas;
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
  const schemas = collectToolSchemas(tools, toolDefinitions);
  let rawTokens = 0;
  for (const json of schemas.values()) {
    rawTokens += tokenCounter(new SystemMessage(json));
  }
  const multiplier = getToolTokenMultiplier(provider, clientOptions);
  return Math.ceil(rawTokens * multiplier);
}

/**
 * Returns tool schema tokens, using per-tool caching to avoid redundant
 * token counting. Each tool's raw (pre-multiplier) token count is cached
 * individually by name, so adding/removing a tool only requires computing
 * the new one. The provider-specific multiplier is applied to the sum.
 *
 * Returns 0 if there are no tools.
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
  const schemas = collectToolSchemas(tools, toolDefinitions);
  if (schemas.size === 0) {
    return 0;
  }

  let cache: Keyv | undefined;
  try {
    cache = getCache();
  } catch (err) {
    logger.debug('[toolTokens] Cache init failed, computing fresh', err);
  }

  let rawTotal = 0;
  const toWrite: Array<{ key: string; value: number }> = [];

  for (const [name, json] of schemas) {
    let rawCount: number | undefined;

    if (cache) {
      try {
        rawCount = (await cache.get(name)) as number | undefined;
      } catch {
        // Cache read failed for this tool — will compute fresh
      }
    }

    if (rawCount == null || rawCount <= 0) {
      rawCount = tokenCounter(new SystemMessage(json));
      if (rawCount > 0 && cache) {
        toWrite.push({ key: name, value: rawCount });
      }
    }

    rawTotal += rawCount;
  }

  // Fire-and-forget cache writes for newly computed tools
  if (cache && toWrite.length > 0) {
    for (const { key, value } of toWrite) {
      cache.set(key, value).catch((err: unknown) => {
        logger.debug(`[toolTokens] Cache write failed for ${key}`, err);
      });
    }
  }

  const multiplier = getToolTokenMultiplier(provider, clientOptions);
  return Math.ceil(rawTotal * multiplier);
}
