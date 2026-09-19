import { z } from 'zod';
import { Router } from 'express';
import { SystemCapabilities } from '@librechat/data-schemas';
import {
  mediaIdSchema,
  mediaPageRequestSchema,
  mediaRecoveryRequestSchema,
} from 'librechat-data-provider';
import type {
  RecordAuditEntryInput,
  RecordAuditEntryOptions,
  SystemCapability,
} from '@librechat/data-schemas';
import type { RequestHandler } from 'express';
import type { CapabilityUser } from '~/middleware/capabilities';
import type { MediaRecoveryServices } from '~/media/recovery';
import type { ServerRequest } from '~/types/http';
import { classifyMediaError, sendMediaError } from '~/media/http';
import { MediaServiceError } from '~/media/errors';
import { buildAuditContext } from './context';

export interface AdminMediaDeps {
  services?: MediaRecoveryServices;
  hasCapability(user: CapabilityUser, capability: SystemCapability): Promise<boolean>;
  recordAuditEntry(
    input: RecordAuditEntryInput,
    options: RecordAuditEntryOptions,
  ): Promise<object | null>;
  log(error: Error): void;
}
export function createAdminMediaHandlers(deps: AdminMediaDeps): {
  list: RequestHandler;
  resolve: RequestHandler;
} {
  async function actor(req: ServerRequest): Promise<CapabilityUser> {
    const id = req.user?.id ?? req.user?._id?.toString();
    if (!id || !req.user?.role)
      throw new MediaServiceError('forbidden', 403, 'Administrator access is required.');
    const user = {
      id,
      role: req.user.role,
      tenantId: req.user.tenantId,
      idOnTheSource: req.user.idOnTheSource ?? null,
    };
    const capabilities = await Promise.all([
      deps.hasCapability(user, SystemCapabilities.ACCESS_ADMIN),
      deps.hasCapability(user, SystemCapabilities.MANAGE_USERS),
    ]);
    if (capabilities.some((held) => !held))
      throw new MediaServiceError(
        'forbidden',
        403,
        'Media recovery requires user administration access.',
      );
    return user;
  }
  const handle =
    (
      action: (
        req: ServerRequest,
        user: CapabilityUser,
        services: MediaRecoveryServices,
      ) => Promise<object>,
    ): RequestHandler =>
    async (request, res) => {
      try {
        const req = request as ServerRequest;
        const user = await actor(req);
        if (!deps.services)
          throw new MediaServiceError('not_ready', 503, 'Media recovery is unavailable.');
        res.status(200).json(await action(req, user, deps.services));
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error('Media recovery failed');
        if (!classifyMediaError(error)) deps.log(error);
        sendMediaError(res, error);
      }
    };
  return {
    list: handle(async (req, user, services) =>
      services.list({
        ...mediaPageRequestSchema.parse(req.query),
        tenantId: user.tenantId ?? null,
      }),
    ),
    resolve: handle(async (req, user, services) => {
      const request = mediaRecoveryRequestSchema.parse(req.body);
      const { ownerId, jobId } = z
        .object({ ownerId: mediaIdSchema, jobId: mediaIdSchema })
        .parse(req.params);
      return services.resolve({
        scope: { ownerId, tenantId: user.tenantId ?? null },
        jobId,
        actorId: user.id,
        request,
        audit: async (outcome) => {
          await deps.recordAuditEntry(
            {
              action: 'approval.media_recovery',
              outcome,
              severity: 'warning',
              actor: { type: 'user', id: user.id, name: req.user?.name ?? user.id },
              target: { type: 'media_job', id: jobId },
              tenantId: user.tenantId,
              metadata: {
                ownerId,
                clientRequestId: request.clientRequestId,
                action: request.action,
                expectedVersion: request.expectedVersion,
                evidence: request.evidence,
                ...(request.action === 'settle'
                  ? { costUSD: request.costUSD, terminalStatus: request.terminalStatus }
                  : {}),
              },
              context: buildAuditContext(req),
            },
            { failClosed: true },
          );
        },
      });
    }),
  };
}

export function createAdminMediaRouter(
  deps: AdminMediaDeps & { requireJwtAuth: RequestHandler },
): Router {
  const router = Router();
  const handlers = createAdminMediaHandlers(deps);
  router.use(deps.requireJwtAuth);
  router.get('/jobs', handlers.list);
  router.post('/jobs/:ownerId/:jobId/recovery', handlers.resolve);
  return router;
}
