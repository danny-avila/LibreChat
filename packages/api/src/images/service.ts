import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { getImageModel, ASPECT_RATIOS } from './models';
import { submitPrediction, getPrediction } from './client';
import type { ImageGenConfig } from './client';
import type { IMongoFile } from '@librechat/data-schemas';

export interface ImageDeps {
  fetchImage: (
    url: string,
  ) => Promise<{ buffer: Buffer; contentType: string; width?: number; height?: number }>;
  saveImageFile: (a: { userId: string; buffer: Buffer; contentType: string }) => Promise<{
    filepath: string;
    source: string;
    bytes: number;
    filename: string;
    storageMetadata: Record<string, unknown>;
  }>;
  createFileRecord: (doc: Partial<IMongoFile>) => Promise<IMongoFile | null>;
  findFileByPrediction: (userId: string, predictionId: string) => Promise<IMongoFile | null>;
}

export async function submitGeneration(
  args: {
    model: string;
    prompt: string;
    aspectRatio: string;
    param?: string;
    imageUrls?: string[];
  },
  cfg: ImageGenConfig,
): Promise<{ predictionId: string }> {
  // TODO(gating): checkBillingAccess(featureFlag: 'image_gen')
  const model = getImageModel(args.model);
  const prompt = (args.prompt ?? '').trim();
  if (!prompt) {
    throw new Error('prompt is required');
  }
  if (prompt.length > 20000) {
    throw new Error('prompt too long');
  }
  if (!(ASPECT_RATIOS as readonly string[]).includes(args.aspectRatio)) {
    throw new Error(`invalid aspect_ratio: ${args.aspectRatio}`);
  }
  const paramValue = args.param ?? model.defaultParam;
  if (!model.paramValues.includes(paramValue)) {
    throw new Error(`invalid ${model.paramKey}: ${paramValue}`);
  }
  if (model.paramKey === 'resolution') {
    if (paramValue === '4K' && args.aspectRatio === '1:1') {
      throw new Error('1:1 cannot be 4K');
    }
    if (args.aspectRatio === 'auto' && paramValue !== '1K') {
      throw new Error('auto aspect_ratio supports only 1K');
    }
  }
  const imageUrls = args.imageUrls?.filter(Boolean) ?? [];
  if (imageUrls.length > 0 && !model.supportsEdit) {
    throw new Error(`${model.id} does not support image edit`);
  }
  const predictionId = await submitPrediction(
    {
      model,
      prompt,
      aspectRatio: args.aspectRatio,
      paramValue,
      imageUrls: imageUrls.length ? imageUrls : undefined,
    },
    cfg,
  );
  return { predictionId };
}

export async function resolveResult(
  args: { predictionId: string; userId: string; model: string; prompt: string },
  deps: ImageDeps,
  cfg: ImageGenConfig,
): Promise<{ status: string; file?: IMongoFile }> {
  const existing = await deps.findFileByPrediction(args.userId, args.predictionId);
  if (existing) {
    return { status: 'completed', file: existing };
  }
  const pred = await getPrediction(args.predictionId, cfg);
  if (pred.status === 'created' || pred.status === 'processing') {
    return { status: pred.status };
  }
  if (pred.status === 'failed' || pred.status === 'error') {
    throw new Error(pred.error ?? 'image generation failed');
  }
  const url = pred.outputs[0];
  if (!url) {
    throw new Error('image generation returned no output');
  }
  const img = await deps.fetchImage(url);
  const saved = await deps.saveImageFile({
    userId: args.userId,
    buffer: img.buffer,
    contentType: img.contentType,
  });
  const storageExtra = saved.storageMetadata as { storageKey?: string; storageRegion?: string };
  const file = await deps.createFileRecord({
    user: new Types.ObjectId(args.userId),
    file_id: uuidv4(),
    context: 'image_generation',
    model: args.model,
    source: saved.source,
    filepath: saved.filepath,
    filename: saved.filename,
    bytes: saved.bytes,
    type: img.contentType,
    width: img.width,
    height: img.height,
    storageKey: storageExtra.storageKey,
    storageRegion: storageExtra.storageRegion,
    metadata: { imageGen: { prompt: args.prompt, predictionId: args.predictionId } },
  });
  if (!file) {
    throw new Error('failed to persist generated image');
  }
  return { status: 'completed', file };
}
