import { useCallback } from 'react';
import type { TStartupConfig } from 'librechat-data-provider';
import { getModelSpec, applyModelSpecEphemeralAgent } from '~/utils';
import { useUpdateEphemeralAgent } from './useUpdateEphemeralAgent';

/**
 * Hook that applies a model spec from a preset to an ephemeral agent.
 * This is used when initializing a new conversation with a preset that has a spec.
 */
export function useApplyModelSpecEffects() {
  const updateEphemeralAgent = useUpdateEphemeralAgent();

  const applyPresetModelSpec = useCallback(
    ({
      convoId,
      specName,
      startupConfig,
    }: {
      convoId: string | null;
      specName?: string | null;
      startupConfig?: TStartupConfig;
    }) => {
      if (specName == null || !specName) {
        return;
      }

      const modelSpec = getModelSpec({
        specName,
        startupConfig,
      });

      applyModelSpecEphemeralAgent({
        convoId,
        modelSpec,
        updateEphemeralAgent,
      });
    },
    [updateEphemeralAgent],
  );

  return applyPresetModelSpec;
}

export default useApplyModelSpecEffects;
