import { createHash } from 'crypto';
import { logger } from '@librechat/data-schemas';
import { SystemMessage } from '@librechat/agents/langchain/messages';
import { CacheKeys, Time } from 'librechat-data-provider';
import {
  Providers,
  toJsonSchema,
  ANTHROPIC_TOOL_TOKEN_MULTIPLIER,
  DEFAULT_TOOL_TOKEN_MULTIPLIER,
} from '@librechat/agents';

import type {
  GenericTool,
  LCTool,
  TokenCounter,
  ClientOptions,
  LCToolRegistry,
} from '@librechat/agents';
import type { Keyv } from 'keyv';

import { standardCache } from '~/cache';

interface ToolEntry {
  cacheKey: string;
  json: string;
}

interface CollectToolSchemasOptions {
  toolRegistry?: LCToolRegistry;
  discoveredTools?: ReadonlySet<string>;
}

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

function hashForCache(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 16);
}

/** Mirrors @librechat/agents encodingForModel; raw cached counts are tokenizer-scoped. */
function getCounterNamespace(clientOptions?: ClientOptions): string {
  const model = String((clientOptions as { model?: string } | undefined)?.model ?? '');
  return model.toLowerCase().includes('claude') ? 'claude' : 'o200k_base';
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isDirectToolDefinition(def: LCTool, discoveredTools?: ReadonlySet<string>): boolean {
  const allowedCallers = def.allowed_callers ?? ['direct'];
  if (!allowedCallers.includes('direct')) {
    return false;
  }
  return def.defer_loading !== true || discoveredTools?.has(def.name) === true;
}

function isDirectInstanceTool(
  tool: GenericTool,
  hasToolDefinitions: boolean,
  toolRegistry?: LCToolRegistry,
  discoveredTools?: ReadonlySet<string>,
): boolean {
  if (hasToolDefinitions || !toolRegistry || !('name' in tool)) {
    return true;
  }

  const toolName = (tool as unknown as { name?: unknown }).name;
  if (typeof toolName !== 'string') {
    return true;
  }

  const def = toolRegistry.get(toolName);
  if (!def) {
    return true;
  }

  const allowedCallers = def.allowed_callers ?? ['direct'];
  if (!allowedCallers.includes('direct')) {
    return false;
  }

  return def.defer_loading !== true || discoveredTools?.has(toolName) === true;
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
 * Builds a list of tool entries with cache keys and serialized schemas.
 * Deduplicates: a tool present in `tools` (with a schema) takes precedence
 * over a matching `toolDefinitions` entry.
 *
 * Cache key includes toolType when available (from LCTool) to differentiate
 * builtin/mcp/action tools that may share a name.
 * GenericTool entries use the `mcp` flag when present.
 */
export function collectToolSchemas(
  tools?: GenericTool[],
  toolDefinitions?: LCTool[],
  options: CollectToolSchemasOptions = {},
): ToolEntry[] {
  const seen = new Set<string>();
  const entries: ToolEntry[] = [];
  const hasToolDefinitions = (toolDefinitions?.length ?? 0) > 0;
  const { toolRegistry, discoveredTools } = options;

  if (tools) {
    for (const tool of tools) {
      if (!isDirectInstanceTool(tool, hasToolDefinitions, toolRegistry, discoveredTools)) {
        continue;
      }
      const result = serializeGenericTool(tool);
      if (!result || !result.name) {
        continue;
      }
      seen.add(result.name);
      const toolType =
        (tool as unknown as Record<string, unknown>).mcp === true ? 'mcp' : 'builtin';
      entries.push({ cacheKey: `${result.name}:${toolType}`, json: result.json });
    }
  }

  if (toolDefinitions) {
    for (const def of toolDefinitions) {
      if (!def.name || seen.has(def.name) || !isDirectToolDefinition(def, discoveredTools)) {
        continue;
      }
      seen.add(def.name);
      const toolType = def.toolType ?? 'builtin';
      entries.push({ cacheKey: `${def.name}:${toolType}`, json: serializeToolDef(def) });
    }
  }

  return entries;
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
  options?: CollectToolSchemasOptions,
): number {
  const entries = collectToolSchemas(tools, toolDefinitions, options);
  let rawTokens = 0;
  for (const { json } of entries) {
    rawTokens += tokenCounter(new SystemMessage(json));
  }
  const multiplier = getToolTokenMultiplier(provider, clientOptions);
  return Math.ceil(rawTokens * multiplier);
}

/**
 * Returns tool schema tokens, using per-tool caching to avoid redundant
 * token counting. Each tool's raw (pre-multiplier) token count is cached
 * individually, keyed by tenant, tokenizer namespace, tool name/type, and
 * schema fingerprint. The provider-specific multiplier is applied to the sum.
 *
 * Returns 0 if there are no tools.
 */
export async function getOrComputeToolTokens({
  tools,
  toolDefinitions,
  provider,
  clientOptions,
  tokenCounter,
  tenantId,
  toolRegistry,
  discoveredTools,
}: {
  tools?: GenericTool[];
  toolDefinitions?: LCTool[];
  provider: Providers;
  clientOptions?: ClientOptions;
  tokenCounter: TokenCounter;
  tenantId?: string;
  toolRegistry?: LCToolRegistry;
  discoveredTools?: ReadonlySet<string>;
}): Promise<number> {
  const entries = collectToolSchemas(tools, toolDefinitions, { toolRegistry, discoveredTools });
  if (entries.length === 0) {
    return 0;
  }

  const keyPrefix = tenantId ? `${tenantId}:` : '';
  const counterNamespace = getCounterNamespace(clientOptions);

  let cache: Keyv | undefined;
  try {
    cache = getCache();
  } catch (err) {
    logger.debug('[toolTokens] Cache init failed, computing fresh', err);
  }

  const keyedEntries = entries.map(({ cacheKey, json }) => ({
    key: `${keyPrefix}${counterNamespace}:${cacheKey}:${hashForCache(json)}`,
    json,
  }));
  const cachedCounts: Array<number | undefined> = new Array(keyedEntries.length);

  if (cache) {
    const activeCache = cache;
    try {
      const readResults = await activeCache.getMany<number>(keyedEntries.map(({ key }) => key));
      for (let i = 0; i < readResults.length; i++) {
        if (isPositiveFiniteNumber(readResults[i])) {
          cachedCounts[i] = readResults[i];
        }
      }
    } catch (err) {
      logger.debug('[toolTokens] Cache batch read failed, computing misses fresh', err);
    }
  }

  let rawTotal = 0;
  const toWrite: Array<{ key: string; value: number }> = [];

  for (let i = 0; i < keyedEntries.length; i++) {
    const { key, json } = keyedEntries[i];
    let rawCount = cachedCounts[i];

    if (rawCount == null) {
      rawCount = tokenCounter(new SystemMessage(json));
      if (rawCount > 0 && cache) {
        toWrite.push({ key, value: rawCount });
      }
    }

    rawTotal += rawCount;
  }

  if (cache && toWrite.length > 0) {
    cache.setMany(toWrite).catch((err: unknown) => {
      logger.debug('[toolTokens] Cache batch write failed', err);
    });
  }

  const multiplier = getToolTokenMultiplier(provider, clientOptions);
  return Math.ceil(rawTotal * multiplier);
}
