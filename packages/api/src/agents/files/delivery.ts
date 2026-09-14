import {
  mergeFileConfig,
  getEndpointFileConfig,
  resolveUseResponsesApi,
  getCustomEndpointProvider,
  isSpeechProviderConfigured,
  resolveTurnLLMDeliveryPath,
  hasInferredLLMDeliveryPath,
} from 'librechat-data-provider';
import type {
  FileConfig,
  TurnDeliveryFile,
  TurnFileConsumers,
  EndpointFileConfig,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';

/** The inputs every consumer of one agent's turn resolves its attachments' delivery against. */
export interface AgentDeliveryRouting {
  fileConfig: FileConfig;
  endpointConfig: EndpointFileConfig;
  endpoint: string;
  /** The dialect a custom endpoint declares, which decides whether it receives media. Read from
   *  config as upload reads it, so it holds before and after initialization swaps the agent's
   *  provider for the backing client; undefined for a built-in or OpenAI-compatible endpoint. */
  endpointProvider?: string;
  useResponsesApi?: boolean;
  sttConfigured: boolean;
}

/** The app config a turn's attachment routing reads. */
export type AgentDeliveryConfig = Pick<AppConfig, 'fileConfig' | 'speech' | 'endpoints'>;

/** The fields of an agent that route its attachments. */
export interface AgentDeliveryIdentity {
  provider: string;
  endpoint?: string | null;
  model_parameters?: { useResponsesApi?: boolean } | null;
}

/** Resolves an agent's delivery routing the same way for every consumer of its turn. */
export function resolveAgentDeliveryRouting({
  agent,
  config,
}: {
  agent: AgentDeliveryIdentity;
  config?: AgentDeliveryConfig;
}): AgentDeliveryRouting {
  /* Agent file policy is configured under the endpoint the agent names, not the client family
   * initialization may rewrite it to. */
  const endpoint = agent.endpoint ?? agent.provider;
  const fileConfig = mergeFileConfig(config?.fileConfig);
  return {
    fileConfig,
    endpointConfig: getEndpointFileConfig({ fileConfig, endpoint }),
    endpoint,
    endpointProvider: getCustomEndpointProvider(config?.endpoints?.custom, endpoint),
    useResponsesApi: resolveUseResponsesApi(agent.model_parameters?.useResponsesApi),
    sttConfigured: isSpeechProviderConfigured(config?.speech?.stt),
  };
}

/**
 * Gives each attachment record whose route upload inferred the route this turn delivers it by.
 *
 * Endpoint filtering, model-bound limits, content inspection, usage accounting and
 * `extractFileContext` read the stored route, while delivery resolves it again for the endpoint
 * and tools handling the turn, text fallback included. Every place a turn loads attachment
 * records applies this before those checks run, so what is admitted is what is delivered, the
 * same way the run-file encoder resolves each child's copies. A record predating routing and a
 * destination the user chose keep their stored route. Unchanged records are returned as they
 * are, and a changed record is a copy, so the stored route is never rewritten.
 */
export function applyTurnDelivery<T extends TurnDeliveryFile>(
  files: T[],
  {
    agent,
    config,
    consumers,
  }: {
    agent?: AgentDeliveryIdentity | null;
    config?: AgentDeliveryConfig;
    consumers?: TurnFileConsumers;
  },
): T[] {
  if (agent == null || !files.some(hasInferredLLMDeliveryPath)) {
    return files;
  }
  const routing = resolveAgentDeliveryRouting({ agent, config });
  let changed = false;
  const result = files.map((file) => {
    if (!hasInferredLLMDeliveryPath(file)) {
      return file;
    }
    const llmDeliveryPath = resolveTurnLLMDeliveryPath({ file, consumers, ...routing });
    if (llmDeliveryPath == null || llmDeliveryPath === file.llmDeliveryPath) {
      return file;
    }
    changed = true;
    return { ...file, llmDeliveryPath };
  });
  return changed ? result : files;
}
