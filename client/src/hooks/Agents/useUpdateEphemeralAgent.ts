import { useRecoilCallback } from 'recoil';
import type { TEphemeralAgent } from 'librechat-data-provider';
import { ephemeralAgentByConvoId } from '~/store';

export function useUpdateEphemeralAgent() {
  const updateEphemeralAgent = useRecoilCallback(
    ({ set }) =>
      (convoId: string, agent: TEphemeralAgent | null) => {
        set(ephemeralAgentByConvoId(convoId), agent);
      },
    [],
  );

  return updateEphemeralAgent;
}
