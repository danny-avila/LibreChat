import { useCallback } from 'react';
import { Constants } from 'librechat-data-provider';
import type { TStartupConfig, TSubmission } from 'librechat-data-provider';
import { useUpdateEphemeralAgent, useApplyNewAgentTemplate } from '~/store/agents';
import { getModelSpec, applyModelSpecEphemeralAgent } from '~/utils';

/**
 * Hook that applies a model spec from a preset to an ephemeral agent.
 * This is used when initializing a new conversation with a preset that has a spec.
 *
 * When a spec is provided, its tool settings are applied to the ephemeral agent.
 * When no spec is provided but specs are configured, the ephemeral agent is reset
 * to null so BadgeRowContext can apply localStorage defaults (non-spec experience).
 */
export function useApplyModelSpecEffects() {
  const updateEphemeralAgent = useUpdateEphemeralAgent();
  const applyModelSpecEffects = useCallback(
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
        if (startupConfig?.modelSpecs?.list?.length) {
          /** Specs are configured but none selected — reset ephemeral agent to null
           *  so BadgeRowContext fills all values (tool toggles + MCP) from localStorage. */
          updateEphemeralAgent((convoId ?? Constants.NEW_CONVO) || Constants.NEW_CONVO, null);
        }
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

  return applyModelSpecEffects;
}

export function useApplyAgentTemplate() {
  const applyAgentTemplate = useApplyNewAgentTemplate();
  /**
   * Helper function to apply agent template with model spec merged into ephemeral agent
   */
  const applyAgentTemplateWithSpec = useCallback(
    ({
      targetId,
      sourceId,
      ephemeralAgent,
      specName,
      startupConfig,
    }: {
      targetId: string;
      sourceId?: TSubmission['conversation']['conversationId'] | null;
      ephemeralAgent: TSubmission['ephemeralAgent'];
      specName?: string | null;
      startupConfig?: TStartupConfig;
    }) => {
      if (!specName) {
        applyAgentTemplate(targetId, sourceId, ephemeralAgent);
        return;
      }

      const modelSpec = getModelSpec({
        specName,
        startupConfig,
      });

      if (!modelSpec) {
        applyAgentTemplate(targetId, sourceId, ephemeralAgent);
        return;
      }

      const mergedAgent = {
        ...ephemeralAgent,
        mcp: [...(ephemeralAgent?.mcp ?? []), ...(modelSpec.mcpServers ?? [])],
        web_search: ephemeralAgent?.web_search ?? modelSpec.webSearch ?? false,
        file_search: ephemeralAgent?.file_search ?? modelSpec.fileSearch ?? false,
        execute_code: ephemeralAgent?.execute_code ?? modelSpec.executeCode ?? false,
        artifacts:
          ephemeralAgent?.artifacts ??
          (modelSpec.artifacts === true ? 'default' : modelSpec.artifacts || ''),
      };

      mergedAgent.mcp = [...new Set(mergedAgent.mcp)];

      applyAgentTemplate(targetId, sourceId, mergedAgent);
    },
    [applyAgentTemplate],
  );

  return applyAgentTemplateWithSpec;
}
