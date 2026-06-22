import { useCallback } from 'react';
import { callMCPAppTool, readMCPResource } from '~/utils/mcpApps';

export function useMCPAppCallbacks(serverName: string) {
  const onCallTool = useCallback(
    (params: { name: string; arguments?: unknown }) =>
      callMCPAppTool(serverName, params.name, (params.arguments as Record<string, unknown>) ?? {}),
    [serverName],
  );

  const onReadResource = useCallback(
    (params: { uri: string }) => readMCPResource(serverName, params.uri),
    [serverName],
  );

  const onOpenLink = useCallback(async ({ url }: { url: string }) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    return {};
  }, []);

  return { onCallTool, onReadResource, onOpenLink };
}
