import { useMemo } from 'react';
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
        map.set(serverName, config.iconPath);
      }
    }
    return map;
  }, [servers]);
}

/** Configured MCP server names, used to resolve the tool-key boundary exactly. */
export function useMCPServerNames(): string[] {
  const { data: servers } = useMCPServersQuery();
  return useMemo(() => (servers ? Object.keys(servers) : []), [servers]);
}
