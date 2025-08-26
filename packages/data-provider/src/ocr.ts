import type { TCustomConfig } from '../src/config';
import { OCRStrategy } from '../src/config';

export function loadOCRConfig(config: TCustomConfig['ocr']): TCustomConfig['ocr'] {
  const baseURL = config?.baseURL ?? '';
  const apiKey = config?.apiKey ?? '';
  const mistralModel = config?.mistralModel ?? '';
  const visionModel = config?.visionModel ?? '';
  return {
    apiKey,
    baseURL,
    mistralModel,
    visionModel,
    strategy: config?.strategy ?? OCRStrategy.MISTRAL_OCR,
  };
}
