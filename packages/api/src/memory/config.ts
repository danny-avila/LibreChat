import { memorySchema } from 'librechat-data-provider';
import type { TCustomConfig, TMemoryConfig } from 'librechat-data-provider';

const hasValidAgent = (agent: TMemoryConfig['agent']) =>
  !!agent &&
  (('id' in agent && !!agent.id) ||
    ('provider' in agent && 'model' in agent && !!agent.provider && !!agent.model));

const isDisabled = (config?: TMemoryConfig | TCustomConfig['memory']) =>
  !config || config.disabled === true;

export function loadMemoryConfig(config: TCustomConfig['memory']): TMemoryConfig | undefined {
  if (!config) return undefined;
  if (isDisabled(config)) return config as TMemoryConfig;

  if (!hasValidAgent(config.agent)) {
    return { ...config, disabled: true } as TMemoryConfig;
  }

  const charLimit = memorySchema.shape.charLimit.safeParse(config.charLimit).data ?? 10000;

  return { ...config, charLimit };
}

export function isMemoryEnabled(config: TMemoryConfig | undefined): boolean {
  if (isDisabled(config)) return false;
  return hasValidAgent(config!.agent);
}
