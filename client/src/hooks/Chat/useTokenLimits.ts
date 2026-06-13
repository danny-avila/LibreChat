import { useMemo } from 'react';
import { Providers, EModelEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type { TConversation, TModelTokenomics } from 'librechat-data-provider';
import { useGetStartupConfig, useTokenConfigQuery, useGetAgentByIdQuery } from '~/data-provider';
import { getModelSpec } from '~/utils';

/** Gemini tokenomics are advertised under the `google` endpoint, so a
 *  Vertex-backed agent (`provider: 'vertexai'`) must look up there. */
function normalizeTokenConfigKey(endpoint: string): string {
  return endpoint === Providers.VERTEXAI ? EModelEndpoint.google : endpoint;
}

export interface TokenLimits {
  /** Statically resolved max context; live snapshots override this at run time */
  maxContextTokens?: number;
  rates?: TModelTokenomics;
  endpoint?: string;
  model?: string;
}

function toNumber(value: unknown): number | undefined {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return typeof num === 'number' && Number.isFinite(num) && num > 0 ? num : undefined;
}

/**
 * Mirrors the backend resolution chain (packages/api agents/initialize.ts):
 * explicit conversation setting → agent params → model spec preset →
 * server-resolved token config lookup.
 */
export default function useTokenLimits(conversation: TConversation | null): TokenLimits {
  const { data: startupConfig } = useGetStartupConfig();
  const { data: tokenConfig } = useTokenConfigQuery();

  const endpoint = conversation?.endpoint ?? '';
  const agentId = isAgentsEndpoint(endpoint) ? conversation?.agent_id : null;
  const { data: agent } = useGetAgentByIdQuery(agentId);

  const spec = conversation?.spec;
  const model = conversation?.model;
  const maxContextSetting = conversation?.maxContextTokens;

  return useMemo(() => {
    const specPreset = getModelSpec({ specName: spec, startupConfig })?.preset;

    let lookupEndpoint = endpoint;
    let lookupModel = model ?? '';
    if (agent) {
      lookupEndpoint = agent.provider ?? endpoint;
      lookupModel = agent.model ?? lookupModel;
    } else if (specPreset) {
      lookupEndpoint = specPreset.endpoint ?? lookupEndpoint;
      lookupModel = lookupModel || (specPreset.model ?? '');
    }
    lookupEndpoint = normalizeTokenConfigKey(lookupEndpoint);

    const rates = tokenConfig?.[lookupEndpoint]?.[lookupModel];
    const maxContextTokens =
      toNumber(maxContextSetting) ??
      toNumber(agent?.model_parameters?.maxContextTokens) ??
      toNumber(specPreset?.maxContextTokens) ??
      rates?.context;

    return { maxContextTokens, rates, endpoint: lookupEndpoint, model: lookupModel };
  }, [endpoint, model, spec, maxContextSetting, agent, startupConfig, tokenConfig]);
}
