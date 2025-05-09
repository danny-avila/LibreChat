import type { TCustomConfig } from '../src/config';
import { OCRStrategy } from '../src/config';

export function loadOCRConfig(config: TCustomConfig['ocr']): TCustomConfig['ocr'] {
  const baseURL = config?.baseURL ?? '';
  const apiKey = config?.apiKey ?? '';
  const mistralModel = config?.mistralModel ?? '';  
  const documentIntelligenceModel = config?.documentIntelligenceModel ?? '';
  
  return {
    apiKey,
    baseURL,
    mistralModel,
    documentIntelligenceModel,
    strategy: config?.strategy ?? OCRStrategy.MISTRAL_OCR,
  };
}
