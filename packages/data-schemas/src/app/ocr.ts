import { OCRStrategy } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';

export function loadOCRConfig(config?: TCustomConfig['ocr']): TCustomConfig['ocr'] | undefined {
  if (!config) return;
  const baseURL = config?.baseURL ?? '';
  const apiKey = config?.apiKey ?? '';
  const mistralModel = config?.mistralModel ?? '';
  const customStrategyModule = config?.customStrategyModule ?? '';
  return {
    apiKey,
    baseURL,
    mistralModel,
    customStrategyModule,
    strategy: config?.strategy ?? OCRStrategy.MISTRAL_OCR,
  };
}
