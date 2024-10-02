import { TAgentsMap } from 'librechat-data-provider';
import { useMemo } from 'react';
import { useListAgentsQuery } from '~/data-provider';
import { mapAgents } from '~/utils';

export default function useAgentsMap({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}): TAgentsMap | undefined {
  const { data: agentsList = null } = useListAgentsQuery(undefined, {
    select: (res) => mapAgents(res.data),
    enabled: isAuthenticated,
  });

  const agents = useMemo<TAgentsMap | undefined>(() => {
    return agentsList !== null ? agentsList : undefined;
  }, [agentsList]);

  return agents;
}
