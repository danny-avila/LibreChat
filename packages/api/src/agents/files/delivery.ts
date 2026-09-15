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
  TurnDeliveryRouting,
  TurnDeliveryFile,
  TurnFileConsumers,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';

/** The app config a turn's attachment routing reads. */
export type TurnDeliveryConfig = Pick<AppConfig, 'fileConfig' | 'speech' | 'endpoints'>;

/** The fields of an agent that route its attachments. */
export interface TurnDeliveryAgent {
  provider: string;
  /** The endpoint name initialization records before it swaps `provider` for the backing
   *  client; an agent loaded without one is routed by its provider. */
  endpoint?: string | null;
  /** The Responses API setting the turn runs on, once initialization has decided it. */
  model_parameters?: { useResponsesApi?: boolean } | null;
}

/**
 * Settles how the agent running a turn receives its attachments.
 *
 * Read once, after initialization has resolved the backing provider and the Responses API
 * decision: the file policy is the one configured under the endpoint's own name, the media
 * dialect is the one its config declares rather than the client family it runs as, and the
 * Responses setting is the one the model call uses. Every reader of a turn route consumes the
 * returned value, so delivery, steering and child run-file encoding cannot answer differently.
 */
export function resolveTurnDeliveryRouting({
  agent,
  config,
}: {
  agent: TurnDeliveryAgent;
  config?: TurnDeliveryConfig;
}): TurnDeliveryRouting {
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

/** Materialize the exact turn route before admission without mutating stored records. */
export function applyTurnDelivery<T extends TurnDeliveryFile>(
  files: T[],
  { routing, consumers }: { routing?: TurnDeliveryRouting; consumers?: TurnFileConsumers },
): T[] {
  if (routing == null) {
    return files;
  }
  let changed = false;
  const result = files.map((file) => {
    if (!hasInferredLLMDeliveryPath(file)) {
      return file;
    }
    const llmDeliveryPath = resolveTurnLLMDeliveryPath(routing, file, consumers);
    if (llmDeliveryPath == null || llmDeliveryPath === file.llmDeliveryPath) {
      return file;
    }
    changed = true;
    return { ...file, llmDeliveryPath };
  });
  return changed ? result : files;
}

/**
 * Checkpoints replay already encoded content; current tools and policy cannot remove it.
 * A referenced inferred tool file carrying extracted text may have been delivered as fallback.
 * Charge that text conservatively even if fallback was since disabled. Explicit destinations
 * and records predating routing keep their existing accounting; no stored record is changed.
 */
export function applyCheckpointDelivery<T extends TurnDeliveryFile>(files: T[]): T[] {
  return files.map((file) =>
    hasInferredLLMDeliveryPath(file) && file.llmDeliveryPath === 'none' && file.text
      ? { ...file, llmDeliveryPath: 'text' }
      : file,
  );
}
