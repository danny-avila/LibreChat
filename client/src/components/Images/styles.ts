import type { TranslationKeys } from '~/hooks/useLocalize';

export interface ImageStyle {
  id: string;
  labelKey: TranslationKeys;
  /** English descriptor appended to the prompt; empty for the "none" style. */
  promptSuffix: string;
}

export const IMAGE_STYLES: ImageStyle[] = [
  { id: 'none', labelKey: 'com_ui_image_style_none', promptSuffix: '' },
  {
    id: 'realistic',
    labelKey: 'com_ui_image_style_realistic',
    promptSuffix: 'realistic, photorealistic',
  },
  { id: 'cartoon', labelKey: 'com_ui_image_style_cartoon', promptSuffix: 'cartoon style' },
  { id: '3d', labelKey: 'com_ui_image_style_3d', promptSuffix: '3D render' },
  { id: 'anime', labelKey: 'com_ui_image_style_anime', promptSuffix: 'anime style' },
  { id: 'digital', labelKey: 'com_ui_image_style_digital', promptSuffix: 'digital art' },
  { id: 'abstract', labelKey: 'com_ui_image_style_abstract', promptSuffix: 'abstract art' },
];

export const DEFAULT_IMAGE_STYLE = 'none';

export function applyStyleToPrompt(prompt: string, styleId: string): string {
  const style = IMAGE_STYLES.find((s) => s.id === styleId);
  if (!style || !style.promptSuffix) {
    return prompt;
  }
  return `${prompt}, ${style.promptSuffix}`;
}
