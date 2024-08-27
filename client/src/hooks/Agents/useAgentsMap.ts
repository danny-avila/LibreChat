import { useListAgentsQuery } from '~/data-provider';
import { mapAgents } from '~/utils';

export default function useAgentsMap({ isAuthenticated }: { isAuthenticated: boolean }) {
  return useListAgentsQuery(undefined, {
    select: (res) => mapAgents(res.data),
    enabled: isAuthenticated,
  });
}
