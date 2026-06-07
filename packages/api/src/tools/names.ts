import { createHash } from 'crypto';
import {
  Constants,
  EModelEndpoint,
  Providers,
  normalizeEndpointName,
} from 'librechat-data-provider';
import type { LCTool, LCToolRegistry } from '@librechat/agents';

export const DEFAULT_TOOL_NAME_MAX_LENGTH = 64;
export const MIN_TOOL_NAME_MAX_LENGTH = 16;

export const PROVIDER_TOOL_NAME_MAX_LENGTH_DEFAULTS: Readonly<Record<string, number>> =
  Object.freeze({
    [EModelEndpoint.openAI]: 64,
    [EModelEndpoint.azureOpenAI]: 64,
    [EModelEndpoint.anthropic]: 64,
    [EModelEndpoint.google]: 64,
    [EModelEndpoint.bedrock]: 64,
    [EModelEndpoint.custom]: 64,
    [EModelEndpoint.agents]: 64,
    [Providers.VERTEXAI]: 64,
    [Providers.MISTRALAI]: 64,
    [Providers.MISTRAL]: 64,
    [Providers.DEEPSEEK]: 64,
    [Providers.MOONSHOT]: 64,
    [Providers.OPENROUTER]: 64,
    [Providers.XAI]: 64,
  });

export interface MCPToolNameParts {
  rawName: string;
  serverName: string;
}

export interface MCPToolNameMetadata {
  canonicalName?: string;
  providerToolName?: string;
  mcpRawName?: string;
}

export type LCToolWithMCPNameMetadata = LCTool & MCPToolNameMetadata;

type EndpointConfigRecord = Record<string, unknown>;

function isRecord(value: unknown): value is EndpointConfigRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getEndpoints(appConfig?: unknown): EndpointConfigRecord | undefined {
  if (!isRecord(appConfig)) {
    return undefined;
  }

  const endpoints = appConfig.endpoints;
  return isRecord(endpoints) ? endpoints : undefined;
}

function readToolNameMaxLength(config: unknown): number | undefined {
  if (!isRecord(config)) {
    return undefined;
  }

  const maxLength = config.toolNameMaxLength;
  if (typeof maxLength !== 'number' || !Number.isFinite(maxLength)) {
    return undefined;
  }

  return normalizeToolNameMaxLength(maxLength);
}

function getCustomEndpointConfig(
  endpoints: EndpointConfigRecord | undefined,
  provider?: string,
): EndpointConfigRecord | undefined {
  if (!endpoints || !provider) {
    return undefined;
  }

  const customEndpoints = endpoints[EModelEndpoint.custom];
  if (!Array.isArray(customEndpoints)) {
    return undefined;
  }

  const normalizedProvider = normalizeEndpointName(provider);
  const customEndpointRecords = customEndpoints.filter(
    (endpoint): endpoint is EndpointConfigRecord =>
      isRecord(endpoint) && typeof endpoint.name === 'string',
  );
  const match = customEndpointRecords.find(
    (endpoint) => normalizeEndpointName(String(endpoint.name)) === normalizedProvider,
  );
  if (match) {
    return match;
  }

  const lowercaseMatches = customEndpointRecords.filter(
    (endpoint) => String(endpoint.name).toLowerCase() === provider.toLowerCase(),
  );
  return lowercaseMatches.length === 1 ? lowercaseMatches[0] : undefined;
}

function getProviderEndpointConfig(
  endpoints: EndpointConfigRecord | undefined,
  provider?: string,
): unknown {
  if (!endpoints || !provider) {
    return undefined;
  }

  const directConfig = endpoints[provider];
  if (isRecord(directConfig)) {
    return directConfig;
  }

  return getCustomEndpointConfig(endpoints, provider);
}

export function normalizeToolNameMaxLength(maxLength?: number): number {
  if (typeof maxLength !== 'number' || !Number.isFinite(maxLength)) {
    return DEFAULT_TOOL_NAME_MAX_LENGTH;
  }

  return Math.max(MIN_TOOL_NAME_MAX_LENGTH, Math.floor(maxLength));
}

export function getProviderToolNameMaxLengthDefault(provider?: string): number {
  if (!provider) {
    return DEFAULT_TOOL_NAME_MAX_LENGTH;
  }

  return (
    PROVIDER_TOOL_NAME_MAX_LENGTH_DEFAULTS[provider] ??
    PROVIDER_TOOL_NAME_MAX_LENGTH_DEFAULTS[provider.toLowerCase()] ??
    DEFAULT_TOOL_NAME_MAX_LENGTH
  );
}

export function resolveToolNameMaxLength({
  appConfig,
  provider,
}: {
  appConfig?: unknown;
  provider?: string;
}): number {
  const endpoints = getEndpoints(appConfig);
  const providerConfig = getProviderEndpointConfig(endpoints, provider);
  const providerMaxLength = readToolNameMaxLength(providerConfig);
  const allMaxLength = readToolNameMaxLength(endpoints?.all);

  return normalizeToolNameMaxLength(
    providerMaxLength ?? allMaxLength ?? getProviderToolNameMaxLengthDefault(provider),
  );
}

export function parseMCPToolName(toolName: string): MCPToolNameParts | undefined {
  const delimiterIndex = toolName.lastIndexOf(Constants.mcp_delimiter);
  if (delimiterIndex === -1) {
    return undefined;
  }

  return {
    rawName: toolName.slice(0, delimiterIndex),
    serverName: toolName.slice(delimiterIndex + Constants.mcp_delimiter.length),
  };
}

export function isProviderToolNameCompatible(
  toolName: string,
  maxLength = DEFAULT_TOOL_NAME_MAX_LENGTH,
): boolean {
  return (
    toolName.length > 0 &&
    toolName.length <= normalizeToolNameMaxLength(maxLength) &&
    /^[A-Za-z0-9_-]+$/.test(toolName)
  );
}

function sanitizeToolNamePart(name: string): string {
  const sanitized = name
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized || 'tool';
}

function getToolNameHash(input: string, attempt: number, length: number): string {
  const hashInput = attempt === 0 ? input : `${input}:${attempt}`;
  return createHash('sha256').update(hashInput).digest('hex').slice(0, length);
}

export function createProviderToolName({
  canonicalName,
  maxLength = DEFAULT_TOOL_NAME_MAX_LENGTH,
  usedToolNames = new Set<string>(),
}: {
  canonicalName: string;
  maxLength?: number;
  usedToolNames?: Set<string>;
}): string {
  const normalizedMaxLength = normalizeToolNameMaxLength(maxLength);
  if (
    isProviderToolNameCompatible(canonicalName, normalizedMaxLength) &&
    !usedToolNames.has(canonicalName)
  ) {
    return canonicalName;
  }

  const parsed = parseMCPToolName(canonicalName);
  const sourceName = parsed?.rawName ?? canonicalName;
  const prefix = 'mcp_';
  const hashLength = normalizedMaxLength >= 24 ? 12 : 8;
  const suffixLength = hashLength + 1;
  const baseLength = Math.max(1, normalizedMaxLength - prefix.length - suffixLength);
  const base = sanitizeToolNamePart(sourceName).slice(0, baseLength);

  for (let attempt = 0; attempt < 1000; attempt++) {
    const hash = getToolNameHash(canonicalName, attempt, hashLength);
    const candidate = `${prefix}${base}_${hash}`;
    if (!usedToolNames.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to create unique provider tool name for "${canonicalName}"`);
}

function getCanonicalName(registryName: string, tool: LCTool): string {
  return (tool as LCToolWithMCPNameMetadata).canonicalName ?? registryName;
}

export function resolveToolNameForExecution(
  toolName: string,
  toolRegistry?: LCToolRegistry,
): string {
  if (!toolRegistry) {
    return toolName;
  }

  const directTool = toolRegistry.get(toolName);
  if (directTool) {
    return getCanonicalName(toolName, directTool);
  }

  const rawMatches: string[] = [];
  for (const [registryName, tool] of toolRegistry.entries()) {
    const metadata = tool as LCToolWithMCPNameMetadata;
    const canonicalName = getCanonicalName(registryName, tool);

    if (
      metadata.providerToolName === toolName ||
      metadata.canonicalName === toolName ||
      tool.name === toolName
    ) {
      return canonicalName;
    }

    if (metadata.mcpRawName === toolName) {
      rawMatches.push(canonicalName);
    }
  }

  return rawMatches.length === 1 ? rawMatches[0] : toolName;
}
