import { brainiac } from 'brainiac-data-provider';
import type { DynamicSettingProps } from 'brainiac-data-provider';

type BrainiacKeys = keyof typeof brainiac;

type BrainiacParams = {
  modelOptions: Omit<NonNullable<DynamicSettingProps['conversation']>, BrainiacKeys>;
  resendFiles: boolean;
  promptPrefix?: string | null;
  maxContextTokens?: number;
  fileTokenLimit?: number;
  modelLabel?: string | null;
};

/**
 * Separates Brainiac-specific parameters from model options
 * @param options - The combined options object
 */
export function extractBrainiacParams(
  options?: DynamicSettingProps['conversation'],
): BrainiacParams {
  if (!options) {
    return {
      modelOptions: {} as Omit<NonNullable<DynamicSettingProps['conversation']>, BrainiacKeys>,
      resendFiles: brainiac.resendFiles.default as boolean,
    };
  }

  const modelOptions = { ...options };

  const resendFiles =
    (delete modelOptions.resendFiles, options.resendFiles) ??
    (brainiac.resendFiles.default as boolean);
  const promptPrefix = (delete modelOptions.promptPrefix, options.promptPrefix);
  const maxContextTokens = (delete modelOptions.maxContextTokens, options.maxContextTokens);
  const fileTokenLimit = (delete modelOptions.fileTokenLimit, options.fileTokenLimit);
  const modelLabel = (delete modelOptions.modelLabel, options.modelLabel);

  return {
    modelOptions: modelOptions as Omit<
      NonNullable<DynamicSettingProps['conversation']>,
      BrainiacKeys
    >,
    maxContextTokens,
    fileTokenLimit,
    promptPrefix,
    resendFiles,
    modelLabel,
  };
}
