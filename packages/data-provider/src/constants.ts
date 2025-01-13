import { z } from 'zod';

export const defaultAssistantsVersion = 'v2' as const;

export const imageGenTools = {
  dalle: 'dalle',
  dalle2: 'dalle2',
  dalle3: 'dalle3',
} as const;

export type ImageGenTools = typeof imageGenTools;
