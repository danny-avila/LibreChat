import {
  mergeFileConfig,
  getEndpointFileConfig,
  resolveUseResponsesApi,
  isSpeechProviderConfigured,
  resolveTurnLLMDeliveryPath,
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
  /** The provider the agent runs as, which decides whether a custom endpoint receives media. */
  endpointProvider: string;
  useResponsesApi?: boolean;
  sttConfigured: boolean;
}

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
  config?: Pick<AppConfig, 'fileConfig' | 'speech'>;
}): AgentDeliveryRouting {
  /* Agent file policy is configured under the endpoint the agent names, not the client family
   * initialization may rewrite it to. */
  const endpoint = agent.endpoint ?? agent.provider;
  const fileConfig = mergeFileConfig(config?.fileConfig);
  return {
    fileConfig,
    endpointConfig: getEndpointFileConfig({ fileConfig, endpoint }),
    endpoint,
    endpointProvider: agent.provider,
    useResponsesApi: resolveUseResponsesApi(agent.model_parameters?.useResponsesApi),
    sttConfigured: isSpeechProviderConfigured(config?.speech?.stt),
  };
}

/**
 * Marks the attachments this turn delivers as text because no tool it runs can read them.
 *
 * Endpoint filtering, model-bound limits, content inspection and usage accounting read the
 * stored route, so without the mark they would judge a file the turn is about to send as text
 * as one that never reaches the model. Every place a turn loads attachment records applies it
 * before those checks run. Unchanged records are returned as they are, and a marked record is a
 * copy, so the stored route is never rewritten. An unknown agent or tool set marks nothing.
 */
export function applyTurnTextFallback<T extends TurnDeliveryFile>(
  files: T[],
  {
    agent,
    config,
    consumers,
  }: {
    agent?: AgentDeliveryIdentity | null;
    config?: Pick<AppConfig, 'fileConfig' | 'speech'>;
    consumers?: TurnFileConsumers;
  },
): T[] {
  if (files.length === 0 || agent == null || consumers == null) {
    return files;
  }
  const routing = resolveAgentDeliveryRouting({ agent, config });
  if (routing.endpointConfig.textFallbackWithoutTools !== true) {
    return files;
  }
  let marked = false;
  const result = files.map((file) => {
    if (
      file.llmDeliveryPath !== 'none' ||
      resolveTurnLLMDeliveryPath({ file, consumers, ...routing }) !== 'text'
    ) {
      return file;
    }
    marked = true;
    return { ...file, llmDeliveryPath: 'text' as const };
  });
  return marked ? result : files;
}
