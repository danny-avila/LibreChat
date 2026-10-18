/** Changing `type` breaks the MCPOptionsSchema Zod union and produces inspectionFailed stubs that cannot connect. */
export const YAML_LOCKED_FIELDS = new Set(['type']);

/** A stdio server's process fields: only librechat.yaml can set them (D10), so they are read-only here. */
export const PROCESS_LOCKED_FIELDS = new Set([
  ...YAML_LOCKED_FIELDS,
  'command',
  'args',
  'env',
  'cwd',
  'stderr',
]);

/** Inspector-populated fields; admin overrides for these are silently ignored. */
export const INSPECTOR_DERIVED = new Set([
  'tools',
  'capabilities',
  'initDuration',
  'inspectionFailed',
  'updatedAt',
  'dbId',
  'source',
]);

const TRANSPORT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  stdio: ['command', 'args', 'env', 'cwd', 'stderr'],
  sse: ['url', 'headers'],
  'streamable-http': ['url', 'headers'],
  http: ['url', 'headers'],
  websocket: ['url'],
};

const ALL_TRANSPORT_KEYS = new Set(Object.values(TRANSPORT_FIELDS).flat());
const REMOTE_ONLY_FIELDS = new Set(['requiresOAuth', 'apiKey', 'oauth', 'oauth_headers']);
const REMOTE_TRANSPORTS = new Set(['sse', 'streamable-http', 'http', 'websocket']);
const HTTP_ONLY_FIELDS = new Set(['obo', 'proxy']);
const HTTP_TRANSPORTS = new Set(['sse', 'streamable-http', 'http']);

/** Whether an MCP server field applies to its transport (`url` for remote servers, `command` for stdio), so it is shown and searchable. */
export function isMcpFieldShown(key: string, transport: string): boolean {
  if (INSPECTOR_DERIVED.has(key)) return false;
  if (ALL_TRANSPORT_KEYS.has(key)) return TRANSPORT_FIELDS[transport]?.includes(key) ?? false;
  if (HTTP_ONLY_FIELDS.has(key)) return HTTP_TRANSPORTS.has(transport);
  if (REMOTE_ONLY_FIELDS.has(key)) return REMOTE_TRANSPORTS.has(transport);
  return true;
}
