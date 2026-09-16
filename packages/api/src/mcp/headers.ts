import type { MCPOptions } from 'librechat-data-provider';

/** The header injected by an operator-provided API key, before placeholder resolution. */
export function getAdminApiKeyHeader(
  apiKey: Partial<NonNullable<MCPOptions['apiKey']>> | null | undefined,
): { name: string; value: string } | undefined {
  if (apiKey?.source !== 'admin' || !apiKey.key) {
    return;
  }
  const { key, authorization_type, custom_header } = apiKey;
  const name = authorization_type === 'custom' ? custom_header || 'X-Api-Key' : 'Authorization';
  const prefixes = { basic: 'Basic ', bearer: 'Bearer ', custom: '' };
  const prefix = prefixes[authorization_type ?? 'custom'];
  return { name, value: `${prefix}${key}` };
}

/** A shadowed catalog credential must not be injected or required by a chat connection. */
export function isAdminApiKeyOverridden(
  apiKey: Partial<NonNullable<MCPOptions['apiKey']>> | null | undefined,
  requestHeaders?: Record<string, string | undefined>,
): boolean {
  const header = getAdminApiKeyHeader(apiKey);
  return (
    header != null &&
    requestHeaders != null &&
    Object.keys(requestHeaders).some((name) => name.toLowerCase() === header.name.toLowerCase())
  );
}
