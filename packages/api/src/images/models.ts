export type ImageVendor = 'google' | 'openai';
export type AspectRatio = 'auto' | '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
export const ASPECT_RATIOS: AspectRatio[] = ['auto', '1:1', '9:16', '16:9', '4:3', '3:4'];

export interface ImageModel {
  id: string;
  label: string;
  vendor: ImageVendor;
  supportsEdit: boolean;
  editImagesKey: 'images' | 'input_urls';
  paramKey: 'output_format' | 'resolution';
  paramValues: string[];
  defaultParam: string;
  isDefault?: boolean;
}

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    vendor: 'google',
    supportsEdit: true,
    editImagesKey: 'images',
    paramKey: 'output_format',
    paramValues: ['png', 'jpeg'],
    defaultParam: 'png',
    isDefault: true,
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    vendor: 'openai',
    supportsEdit: true,
    editImagesKey: 'input_urls',
    paramKey: 'resolution',
    paramValues: ['1K', '2K', '4K'],
    defaultParam: '1K',
  },
];

export const DEFAULT_IMAGE_MODEL_ID = (IMAGE_MODELS.find((m) => m.isDefault) ?? IMAGE_MODELS[0]).id;

export function getImageModel(id: string): ImageModel {
  const model = IMAGE_MODELS.find((m) => m.id === id);
  if (!model) {
    throw new Error(`Unknown image model: ${id}`);
  }
  return model;
}
