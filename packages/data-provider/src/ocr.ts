import type { TCustomConfig } from '../src/config';
import { extractEnvVariable } from '../src/utils';
import { OCRStrategy } from '../src/config';

export function loadOCRConfig(config: TCustomConfig['ocr']): TCustomConfig['ocr'] {
  const baseURL = extractEnvVariable(config?.baseURL ?? '');
  const apiKey = extractEnvVariable(config?.apiKey ?? '');
  const mistralModel = extractEnvVariable(config?.mistralModel ?? '');
  return {
    apiKey,
    baseURL,
    mistralModel,
    strategy: config?.strategy ?? OCRStrategy.MISTRAL_OCR,
  };
}
