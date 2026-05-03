import { logger } from '@librechat/data-schemas';
import { mergeFileConfig, formatMB } from 'librechat-data-provider';
import type { NextFunction, Response as ServerResponse } from 'express';
import type { ServerRequest } from '~/types/http';

export interface StorageQuotaMiddlewareOptions {
  getStorageUsage: (
    userId: string,
    defaultLimit: number | null,
  ) => Promise<{ bytesUsed: number; bytesLimit: number | null }>;
}

export function createCheckStorageQuota({ getStorageUsage }: StorageQuotaMiddlewareOptions) {
  return async (req: ServerRequest, res: ServerResponse, next: NextFunction): Promise<void> => {
    try {
      const size = (req as ServerRequest & { file?: Express.Multer.File }).file?.size ?? 0;
      if (size === 0) {
        return next();
      }

      const quotaConfig = mergeFileConfig(req.config?.fileConfig).storageQuota;
      if (!quotaConfig?.enabled) {
        return next();
      }

      const userId = req.user?.id;
      if (!userId) {
        return next();
      }

      const defaultLimit =
        typeof quotaConfig.defaultLimit === 'number' && quotaConfig.defaultLimit >= 0
          ? quotaConfig.defaultLimit
          : null;

      const { bytesUsed, bytesLimit } = await getStorageUsage(userId, defaultLimit);

      logger.debug(
        `[storage-quota] check user=${userId} fileSize=${size} used=${bytesUsed} limit=${bytesLimit ?? 'none'}`,
      );

      // Optimistic check: concurrent uploads from same user may briefly exceed limit — acceptable per product spec.
      if (bytesLimit != null && bytesUsed + size > bytesLimit) {
        logger.info(
          `[storage-quota] REJECT user=${userId}: ${bytesUsed + size} > ${bytesLimit}`,
        );
        res.status(403).json({
          message: 'com_error_storage_quota_exceeded',
          fileSize: formatMB(size),
          used: formatMB(bytesUsed),
          limit: formatMB(bytesLimit),
        });
        return;
      }

      if (bytesLimit != null && bytesLimit > 0) {
        if ((bytesUsed + size) / bytesLimit > quotaConfig.warningThreshold) {
          const warning = {
            used: formatMB(bytesUsed + size),
            limit: formatMB(bytesLimit),
          };
          const originalJson = res.json.bind(res);
          res.json = (body: unknown) => {
            if (
              res.statusCode < 400 &&
              body !== null &&
              typeof body === 'object' &&
              !Array.isArray(body)
            ) {
              return originalJson({ ...(body as Record<string, unknown>), quotaWarning: warning });
            }
            return originalJson(body);
          };
        }
      }

      next();
    } catch (error) {
      logger.error('[storage-quota] error checking quota:', error);
      next(error);
    }
  };
}
