import type { TFile } from './files';

export type TGeneratedImage = TFile;

export interface TImageGenRequest {
  prompt: string;
  model: string;
  aspectRatio: string;
  param?: string;
  imageUrls?: string[];
}

export interface TImagePrediction {
  predictionId: string;
}

export interface TImageResult {
  status: 'created' | 'processing' | 'completed' | 'failed';
  file?: TFile;
}

export interface TImageModel {
  id: string;
  label: string;
  supportsEdit: boolean;
  paramKey: string;
  paramValues: string[];
  defaultParam: string;
}

export interface TImageModelsConfig {
  models: TImageModel[];
  default: string;
  aspectRatios: string[];
}

export interface TImageGalleryPage {
  images: TFile[];
  nextCursor: string | null;
}
