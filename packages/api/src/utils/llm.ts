import { bizu } from 'bizu-data-provider';
import type { DynamicSettingProps } from 'bizu-data-provider';

type BizuKeys = keyof typeof bizu;

type BizuParams = {
  modelOptions: Omit<NonNullable<DynamicSettingProps['conversation']>, BizuKeys>;
  resendFiles: boolean;
  promptPrefix?: string | null;
  maxContextTokens?: number;
  fileTokenLimit?: number;
  modelLabel?: string | null;
};

/**
 * Separates Bizu-specific parameters from model options
 * @param options - The combined options object
 */
export function extractBizuParams(options?: DynamicSettingProps['conversation']): BizuParams {
  if (!options) {
    return {
      modelOptions: {} as Omit<NonNullable<DynamicSettingProps['conversation']>, BizuKeys>,
      resendFiles: bizu.resendFiles.default as boolean,
    };
  }

  const modelOptions = { ...options };

  const resendFiles =
    (delete modelOptions.resendFiles, options.resendFiles) ?? (bizu.resendFiles.default as boolean);
  const promptPrefix = (delete modelOptions.promptPrefix, options.promptPrefix);
  const maxContextTokens = (delete modelOptions.maxContextTokens, options.maxContextTokens);
  const fileTokenLimit = (delete modelOptions.fileTokenLimit, options.fileTokenLimit);
  const modelLabel = (delete modelOptions.modelLabel, options.modelLabel);

  return {
    modelOptions: modelOptions as Omit<NonNullable<DynamicSettingProps['conversation']>, BizuKeys>,
    maxContextTokens,
    fileTokenLimit,
    promptPrefix,
    resendFiles,
    modelLabel,
  };
}
