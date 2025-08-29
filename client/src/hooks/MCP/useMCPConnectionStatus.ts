import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';

export function useMCPConnectionStatus({ enabled }: { enabled?: boolean } = {}) {
  const { data: connectionStatus } = useMCPConnectionStatusQuery({
    enabled,
  });

  return {
    connectionStatus,
  };
}
