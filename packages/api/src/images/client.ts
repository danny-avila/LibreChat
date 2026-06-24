import { createAxiosInstance, logAxiosError } from '~/utils/axios';
import type { ImageModel } from './models';

const axios = createAxiosInstance();

export interface ImageGenConfig {
  baseUrl: string;
  apiKey: string;
}

export interface SubmitArgs {
  model: ImageModel;
  prompt: string;
  aspectRatio: string;
  paramValue: string;
  imageUrls?: string[];
}

export async function submitPrediction(args: SubmitArgs, cfg: ImageGenConfig): Promise<string> {
  const { model, prompt, aspectRatio, paramValue, imageUrls } = args;
  const isEdit = Array.isArray(imageUrls) && imageUrls.length > 0;
  const action = isEdit ? 'image-edit' : 'text-to-image';
  const url = `${cfg.baseUrl}/api/v3/${model.vendor}/${model.id}/${action}`;
  const body: Record<string, unknown> = {
    prompt,
    aspect_ratio: aspectRatio,
    [model.paramKey]: paramValue,
  };
  if (isEdit) {
    body[model.editImagesKey] = imageUrls;
  }
  try {
    const res = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    });
    const id = res.data?.data?.id;
    if (!id) {
      throw new Error('gptsapi submit returned no prediction id');
    }
    return id as string;
  } catch (error) {
    throw new Error(logAxiosError({ error, message: 'gptsapi image submit failed' }));
  }
}

export interface PredictionResult {
  status: string;
  outputs: string[];
  error: string | null;
}

export async function getPrediction(
  predictionId: string,
  cfg: ImageGenConfig,
): Promise<PredictionResult> {
  const url = `${cfg.baseUrl}/api/v3/predictions/${predictionId}/result`;
  try {
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
    const data = res.data?.data ?? {};
    return {
      status: data.status ?? 'unknown',
      outputs: data.outputs ?? [],
      error: data.error ?? null,
    };
  } catch (error) {
    throw new Error(logAxiosError({ error, message: 'gptsapi image poll failed' }));
  }
}
