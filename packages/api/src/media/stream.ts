import { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import { mediaIdSchema, mediaRenditionKindSchema } from 'librechat-data-provider';
import type { MediaMethods, MediaOwnerScope } from '@librechat/data-schemas';
import type { Request } from 'express';
import type { MediaStorage } from './storage';
import { classifyMediaError, sendMediaError } from './http';
import { MediaServiceError } from './errors';

function byteRange(value: string, bytes: number): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || bytes === 0) return;
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return;
  const start = match[1] ? first : Math.max(0, bytes - last);
  const end = match[1] && match[2] ? Math.min(bytes - 1, last) : bytes - 1;
  if (start < 0 || start >= bytes || end < start) return;
  return { start, end };
}

/** Browser-native reads only; mutations remain behind bearer authentication. */
export function createMediaContentRouter({
  repository,
  storage,
  resolveScope,
  log,
}: {
  repository: Pick<MediaMethods, 'getMediaAssetContent'>;
  storage: Pick<MediaStorage, 'open'>;
  resolveScope(request: Request): MediaOwnerScope;
  log(error: Error): void;
}): Router {
  const router = Router();
  router.get('/:fileId/content', async (req, res) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    const controller = new AbortController();
    const close = () => controller.abort();
    res.once('close', close);
    try {
      const scope = resolveScope(req);
      const fileId = mediaIdSchema.parse(req.params.fileId);
      const rendition = mediaRenditionKindSchema.optional().parse(req.query.rendition);
      const asset = await repository.getMediaAssetContent(scope, fileId);
      const content = rendition ? asset?.mediaRenditions?.[rendition] : asset;
      if (!asset || !content) {
        throw new MediaServiceError('not_found', 404, 'Media content was not found.');
      }
      const rangeHeader = req.headers.range;
      const range = rangeHeader ? byteRange(rangeHeader, content.bytes) : undefined;
      res.set({
        'Accept-Ranges': 'bytes',
        'Content-Type': content.type,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(asset.filename).replace(/'/g, '%27')}`,
      });
      if (rangeHeader && !range) {
        res.status(416).set('Content-Range', `bytes */${content.bytes}`).end();
        return;
      }
      res.set('Content-Length', String(range ? range.end - range.start + 1 : content.bytes));
      if (range) {
        res.status(206).set('Content-Range', `bytes ${range.start}-${range.end}/${content.bytes}`);
      }
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const stream = await storage.open(scope, asset, {
        rendition,
        range,
        signal: controller.signal,
      });
      await pipeline(stream, res, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) return;
      const failure = error instanceof Error ? error : new Error('Media streaming failed.');
      if (!classifyMediaError(failure)) log(failure);
      if (res.headersSent || res.destroyed) {
        res.destroy();
      } else {
        res.removeHeader('Content-Length');
        res.removeHeader('Content-Range');
        res.removeHeader('Content-Disposition');
        res.removeHeader('Content-Type');
        sendMediaError(res, failure);
      }
    } finally {
      res.removeListener('close', close);
    }
  });
  return router;
}
