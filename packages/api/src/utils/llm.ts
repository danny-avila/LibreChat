import { vestai } from 'vestai-data-provider';
import type { DynamicSettingProps } from 'vestai-data-provider';

type VestAIKeys = keyof typeof vestai;

type VestAIParams = {
  modelOptions: Omit<NonNullable<DynamicSettingProps['conversation']>, VestAIKeys>;
  resendFiles: boolean;
  promptPrefix?: string | null;
  maxContextTokens?: number;
  fileTokenLimit?: number;
  modelLabel?: string | null;
};

/**
 * Separates VestAI-specific parameters from model options
 * @param options - The combined options object
 */
export function extractVestAIParams(
  options?: DynamicSettingProps['conversation'],
): VestAIParams {
  if (!options) {
    return {
      modelOptions: {} as Omit<NonNullable<DynamicSettingProps['conversation']>, VestAIKeys>,
      resendFiles: vestai.resendFiles.default as boolean,
    };
  }

  const modelOptions = { ...options };

  const resendFiles =
    (delete modelOptions.resendFiles, options.resendFiles) ??
    (vestai.resendFiles.default as boolean);
  const promptPrefix = (delete modelOptions.promptPrefix, options.promptPrefix);
  const maxContextTokens = (delete modelOptions.maxContextTokens, options.maxContextTokens);
  const fileTokenLimit = (delete modelOptions.fileTokenLimit, options.fileTokenLimit);
  const modelLabel = (delete modelOptions.modelLabel, options.modelLabel);

  return {
    modelOptions: modelOptions as Omit<
      NonNullable<DynamicSettingProps['conversation']>,
      VestAIKeys
    >,
    maxContextTokens,
    fileTokenLimit,
    promptPrefix,
    resendFiles,
    modelLabel,
  };
}
