import { z } from 'zod';
import { logger } from '@librechat/data-schemas';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { NextFunction, RequestHandler, Request, Response } from 'express';
import type { CheckAccessParams } from '~/middleware/access';
import type { ConversationImportJob } from './import';
import type { ServerRequest } from '~/types';
import { conversationUpdateSchema, mapConversationManagementError } from './schema';
import { isContentFilterError } from '../middleware/contentFilter';
import { checkAccessWithRequestCache } from '~/middleware/access';
import { isConversationImportError } from './import';

export interface ConversationImportHandlerDeps {
  importConversations: (job: ConversationImportJob) => Promise<void>;
  cleanupUpload: (filepath: string) => Promise<void>;
  getRoleByName: CheckAccessParams['getRoleByName'];
}

const conversationImportBodySchema = z.object({}).strict();

export function validateConversationUpdate(
  req: ServerRequest,
  res: Response,
  next: NextFunction,
): void {
  const parsed = conversationUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    const mapped = mapConversationManagementError('invalid_request', parsed.error);
    res.status(mapped.status).json(mapped.body);
    return;
  }
  next();
}

export function createConversationTagAccess({
  getRoleByName,
}: Pick<ConversationImportHandlerDeps, 'getRoleByName'>): RequestHandler {
  return async (req, res, next): Promise<void> => {
    if (req.body?.tags === undefined) {
      next();
      return;
    }
    try {
      const allowed = await checkAccessWithRequestCache({
        req,
        user: req.user as CheckAccessParams['user'],
        permissionType: PermissionTypes.BOOKMARKS,
        permissions: [Permissions.USE],
        getRoleByName,
      });
      if (allowed) {
        next();
        return;
      }
      const mapped = mapConversationManagementError('permission_denied');
      res.status(mapped.status).json(mapped.body);
    } catch (error) {
      const mapped = mapConversationManagementError('internal_error', error);
      res.status(mapped.status).json(mapped.body);
    }
  };
}

export function createConversationImportHandler({
  importConversations,
  cleanupUpload,
  getRoleByName,
}: ConversationImportHandlerDeps): RequestHandler {
  return async function conversationImportHandler(
    req: ServerRequest & Pick<Request, 'params'>,
    res: Response,
  ): Promise<void> {
    if (!req.file?.path) {
      const mapped = mapConversationManagementError('invalid_request');
      res.status(mapped.status).json(mapped.body);
      return;
    }
    const parsedBody = conversationImportBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      try {
        await cleanupUpload(req.file.path);
      } catch (error) {
        logger.error('[conversationManagement] Failed to clean rejected import upload', error);
      }
      const mapped = mapConversationManagementError('invalid_request', parsedBody.error);
      res.status(mapped.status).json(mapped.body);
      return;
    }
    let importStarted = false;
    try {
      const allowTags = await checkAccessWithRequestCache({
        req,
        user: req.user!,
        permissionType: PermissionTypes.BOOKMARKS,
        permissions: [Permissions.USE],
        getRoleByName,
      });
      importStarted = true;
      await importConversations({
        filepath: req.file.path,
        requestUserId: req.user!.id,
        userRole: req.user?.role,
        interfaceConfig: req.config?.interfaceConfig,
        filters: req.config?.filters,
        ...(req.config?.messageFilter?.pii == null
          ? {}
          : { legacyPii: req.config.messageFilter.pii }),
        format: 'librechat',
        allowTags,
      });
      res.status(201).json({ message: 'Conversation(s) imported successfully' });
    } catch (error) {
      if (!importStarted) {
        try {
          await cleanupUpload(req.file.path);
        } catch (cleanupError) {
          logger.error('[conversationManagement] Failed to clean import upload', cleanupError);
        }
      }
      if (isContentFilterError(error)) {
        res.status(error.statusCode).json(error.body);
        return;
      }
      if (isConversationImportError(error)) {
        const mapped = mapConversationManagementError(error.code);
        res.status(error.statusCode).json(mapped.body);
        return;
      }
      logger.error('[conversationManagement] Import failed', error);
      const mapped = mapConversationManagementError('internal_error');
      res.status(mapped.status).json(mapped.body);
    }
  } as RequestHandler;
}
