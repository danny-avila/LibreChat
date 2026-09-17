import { z } from 'zod';
import path from 'node:path';
import { Router } from 'express';
import { createReadStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { MediaPersistenceError } from '@librechat/data-schemas';
import {
  mediaIdSchema,
  mediaSubmissionRequestSchema,
  mediaImportRequestSchema,
  mediaRetryRequestSchema,
  mediaThreadUpdateSchema,
  mediaPageRequestSchema,
  mediaThreadListRequestSchema,
  mergeFileConfig,
} from 'librechat-data-provider';
import type { Request, Response, RequestHandler } from 'express';
import type { MediaErrorCode } from 'librechat-data-provider';
import type { MediaMethods } from '@librechat/data-schemas';
import type { MediaServices, MediaContext } from './service';
import type { MediaStorage } from './storage';
import { mediaContentByteLimit, mediaContentExtension, normalizeMediaContentType } from './content';
import { assertUploadContentAllowed } from '../files/preflight';
import { parseHostedMediaReference } from './hosted';
import { assertMediaAccess } from './service';
import { MediaServiceError } from './errors';

export type MediaUploadFactory = (options: {
  dest: string;
  limits: { fileSize: number; files: number; fields: number };
}) => {
  single(field: string): RequestHandler;
};

export function sendMediaError(res: Response, error: Error): void {
  let status = 500;
  let code: MediaErrorCode = 'internal_error';
  if (error instanceof MediaServiceError) {
    status = error.status;
    code = error.code;
  } else if (error instanceof z.ZodError) {
    status = 422;
    code = 'invalid_request';
  } else if (error instanceof MediaPersistenceError) {
    const mapping = {
      conflict: 'request_conflict',
      capacity: 'quota_exceeded',
      not_found: 'not_found',
      retired: 'not_found',
      invalid_input: 'invalid_request',
      unsafe_retry: 'submission_uncertain',
    } as const;
    code = mapping[error.code];
    status = 409;
    if (error.code === 'capacity') status = 429;
    else if (error.code === 'not_found' || error.code === 'retired') status = 404;
  }
  res.status(status).json({ error: { code } });
}

export function createMediaRouter({
  services,
  repository,
  storage,
  resolveContext,
  upload,
  tempDirectory,
  id,
}: {
  services: MediaServices;
  repository: MediaMethods;
  storage: MediaStorage;
  resolveContext(request: Request): Promise<MediaContext>;
  upload: MediaUploadFactory;
  tempDirectory: string;
  id: () => string;
}): Router {
  const router = Router();
  const handle =
    <T>(
      action: (req: Request, context: MediaContext) => Promise<T>,
      status = 200,
    ): RequestHandler =>
    async (req, res) => {
      try {
        const context = await resolveContext(req);
        assertMediaAccess(context);
        res.status(status).json(await action(req, context));
      } catch (error) {
        sendMediaError(res, error instanceof Error ? error : new Error('Media request failed'));
      }
    };
  const param = (req: Request, name: string) => mediaIdSchema.parse(req.params[name]);
  const found = <T>(value: T | null): T => {
    if (value == null) {
      throw new MediaServiceError('not_found', 404, 'Media resource is unavailable.');
    }
    return value;
  };

  router.get(
    '/catalog',
    handle((_req, context) => services.queries.catalog(context)),
  );
  router.get(
    '/threads',
    handle((req, context) =>
      services.queries.threads(mediaThreadListRequestSchema.parse(req.query), context),
    ),
  );
  router.get(
    '/threads/:threadId',
    handle((req, context) => services.queries.thread(param(req, 'threadId'), context)),
  );
  router.get(
    '/threads/:threadId/turns',
    handle((req, context) => {
      const query = mediaPageRequestSchema.parse(req.query);
      return services.queries.turns(param(req, 'threadId'), query.cursor, query.limit, context);
    }),
  );
  router.get(
    '/threads/:threadId/turns/:turnId/jobs',
    handle(async (req, context) => {
      found(await repository.getMediaThread(context.scope, param(req, 'threadId')));
      const query = mediaPageRequestSchema.parse(req.query);
      return repository.listMediaTurnJobs({
        scope: context.scope,
        threadId: param(req, 'threadId'),
        turnId: param(req, 'turnId'),
        cursor: query.cursor,
        limit: Math.min(
          query.limit ?? context.config.limits.pageSize,
          context.config.limits.maxPageSize,
        ),
      });
    }),
  );
  router.get(
    '/jobs/:jobId',
    handle(async (req, context) =>
      found(await repository.getMediaJobView(context.scope, param(req, 'jobId'))),
    ),
  );
  router.get(
    '/jobs/:jobId/outputs',
    handle(async (req, context) => {
      const job = found(await repository.getMediaJobView(context.scope, param(req, 'jobId')));
      const query = mediaPageRequestSchema.parse(req.query);
      const start = query.cursor == null ? 0 : Number(query.cursor);
      if (!Number.isSafeInteger(start) || start < 0) {
        throw new MediaServiceError('invalid_request', 422, 'Invalid output cursor.');
      }
      const limit = Math.min(
        query.limit ?? context.config.limits.pageSize,
        context.config.limits.maxPageSize,
      );
      const items = job.outputs.slice(start, start + limit);
      return {
        items,
        ...(start + limit < job.outputs.length ? { nextCursor: String(start + limit) } : {}),
      };
    }),
  );
  router.post(
    '/submissions',
    handle(
      (req, context) =>
        services.commands.submit(mediaSubmissionRequestSchema.parse(req.body), context),
      202,
    ),
  );
  router.get(
    '/submissions/:clientRequestId',
    handle(async (req, context) =>
      found(await repository.getMediaSubmission(context.scope, param(req, 'clientRequestId'))),
    ),
  );
  router.post(
    '/imports',
    handle(
      (req, context) => services.commands.import(mediaImportRequestSchema.parse(req.body), context),
      202,
    ),
  );
  router.get(
    '/imports/:clientRequestId',
    handle(async (req, context) =>
      found(await repository.getMediaImport(context.scope, param(req, 'clientRequestId'))),
    ),
  );
  router.post(
    '/jobs/:jobId/cancel',
    handle((req, context) => services.commands.cancel(param(req, 'jobId'), context)),
  );
  router.post(
    '/jobs/:jobId/retry',
    handle(
      (req, context) =>
        services.commands.retry(
          param(req, 'jobId'),
          mediaRetryRequestSchema.parse(req.body).clientRequestId,
          context,
        ),
      202,
    ),
  );
  router.patch(
    '/threads/:threadId',
    handle((req, context) =>
      services.commands.updateThread(
        param(req, 'threadId'),
        mediaThreadUpdateSchema.parse(req.body),
        context,
      ),
    ),
  );
  router.delete(
    '/threads/:threadId',
    handle((req, context) => services.commands.retire(param(req, 'threadId'), context), 202),
  );
  router.post(
    '/uploads/url',
    handle(
      (req, context) => services.commands.uploadURL(parseHostedMediaReference(req.body), context),
      201,
    ),
  );
  router.post(
    '/uploads',
    handle(async (req, context) => {
      assertMediaAccess(context, true);
      if ((context.config.assets.source ?? context.appConfig.fileStrategy) !== 'local') {
        throw new MediaServiceError(
          'unsupported',
          422,
          'This media storage adapter is not available.',
        );
      }
      await mkdir(tempDirectory, { recursive: true });
      const fileConfig = mergeFileConfig(context.appConfig.fileConfig);
      const maxFileBytes = Math.max(
        context.config.transfers.maxImageBytes,
        context.config.transfers.maxVideoBytes,
        context.config.transfers.maxAudioBytes,
      );
      const receive = upload({
        dest: tempDirectory,
        limits: {
          fileSize: Math.min(maxFileBytes, fileConfig.serverFileSizeLimit ?? maxFileBytes),
          files: 1,
          fields: 1,
        },
      }).single('file');
      await new Promise<void>((resolve, reject) =>
        receive(req, req.res!, (error?: Error | string) => (error ? reject(error) : resolve())),
      );
      const file = req.file;
      if (!file) {
        throw new MediaServiceError('invalid_request', 422, 'Select a source file.');
      }
      try {
        const type = normalizeMediaContentType(file.mimetype);
        if (!mediaContentExtension(type)) {
          throw new MediaServiceError('unsupported', 422, 'Unsupported media reference type.');
        }
        if (file.size > mediaContentByteLimit(type, context.config)) {
          throw new MediaServiceError(
            'invalid_request',
            413,
            'Media exceeds the configured file limit.',
          );
        }
        await assertUploadContentAllowed({
          filters: context.appConfig.filters,
          file: { ...file, mimetype: type },
          fileConfig,
          ocrConfigured: false,
          ragConfigured: false,
        });
        const asset = await storage.publish({
          scope: context.scope,
          outputKey: `upload:${id()}`,
          stream: createReadStream(file.path),
          type,
          filename: path.basename(file.originalname),
          config: context.config,
          expiredAt: new Date(Date.now() + context.config.assets.orphanRetentionMs).toISOString(),
        });
        return { file: asset };
      } finally {
        await unlink(file.path).catch(() => undefined);
      }
    }, 201),
  );
  return router;
}
