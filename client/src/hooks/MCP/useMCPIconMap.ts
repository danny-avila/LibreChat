import { useMemo } from 'react';
import { normalizeServerName } from 'librechat-data-provider';
import { useMCPServersQuery } from '~/data-provider';

export function useMCPIconMap(): Map<string, string> {
  const { data: servers } = useMCPServersQuery();

  return useMemo(() => {
    const map = new Map<string, string>();
    if (!servers) {
      return map;
    }
    for (const [serverName, config] of Object.entries(servers)) {
      if (config.iconPath) {
        /** Looked up with a server name parsed out of a tool key, which carries the
         *  normalized form, so key the map the same way. */
        map.set(normalizeServerName(serverName), config.iconPath);
      }
    }
    return map;
  }, [servers]);
}

/**
 * Configured MCP server names in the normalized form tool keys are built from,
 * so they can be matched against a key. The config is keyed by the raw name.
 */
export function useMCPServerNames(): string[] {
  const { data: servers } = useMCPServersQuery();
  return useMemo(() => (servers ? Object.keys(servers).map(normalizeServerName) : []), [servers]);
}
