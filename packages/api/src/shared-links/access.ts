import { getTenantId, runAsSystem, tenantStorage } from '@librechat/data-schemas';
import { ResourceType, PermissionBits } from 'librechat-data-provider';
import type { Request, Response, NextFunction } from 'express';
import type { Types, Model } from 'mongoose';
import type { IUser } from '@librechat/data-schemas';
import { AccessControlService } from '~/acl/accessControlService';
import { autoMigrateLegacyLink } from './service';
import { isEnabled } from '~/utils';

interface RawSharedLink {
  _id?: Types.ObjectId;
  conversationId: string;
  title?: string;
  user?: string;
  shareId?: string;
  tenantId?: string;
  isPublic?: boolean;
  expiredAt?: Date;
}

export interface SharedLinkAccessDeps {
  mongoose: typeof import('mongoose');
  aclService?: AccessControlService;
}

function isAutoMigrateEnabled(): boolean {
  // Fallback for legacy rows missed by the explicit shared-link permissions migration.
  const val = process.env.SHARED_LINKS_AUTO_MIGRATE;
  return val === undefined || isEnabled(val);
}

export function createSharedLinkAccessMiddleware(deps: SharedLinkAccessDeps) {
  const { mongoose: mg } = deps;
  const aclService = deps.aclService ?? new AccessControlService(mg);

  async function hasPublicViewPermission(resourceId: string): Promise<boolean> {
    return aclService.hasPublicAccess({
      resourceType: ResourceType.SHARED_LINK,
      resourceId,
    });
  }

  return async function canAccessSharedLink(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const { shareId } = req.params;
    if (!shareId) {
      res.status(400).json({ message: 'Missing shareId' });
      return;
    }

    const SharedLink = mg.models.SharedLink as Model<RawSharedLink>;
    const findShare = async () =>
      (await SharedLink.findOne({ shareId }).lean()) as RawSharedLink | null;
    const rawShare = getTenantId() ? await findShare() : await runAsSystem(findShare);

    if (!rawShare) {
      res.status(404).json({ message: 'Shared link not found' });
      return;
    }

    const resourceId = rawShare._id?.toString();
    if (!resourceId) {
      res.status(404).json({ message: 'Shared link not found' });
      return;
    }

    const user = req.user as IUser | undefined;

    const runWithTenant = async (fn: () => Promise<void>): Promise<void> => {
      if (rawShare.tenantId) {
        return tenantStorage.run({ tenantId: rawShare.tenantId }, fn);
      }
      return runAsSystem(fn);
    };

    await runWithTenant(async () => {
      const isLegacy = 'isPublic' in rawShare;

      if (isLegacy) {
        if (!isAutoMigrateEnabled()) {
          res.status(403).json({ message: 'Legacy shared link requires migration' });
          return;
        }
        await autoMigrateLegacyLink(rawShare);
      }

      const publicGranted = await hasPublicViewPermission(resourceId);

      if (publicGranted) {
        if (isEnabled(process.env.ALLOW_SHARED_LINKS_PUBLIC)) {
          (req as unknown as Record<string, unknown>).shareResourceId = resourceId;
          next();
          return;
        }

        if (!user) {
          res.status(401).json({ message: 'Authentication required' });
          return;
        }

        (req as unknown as Record<string, unknown>).shareResourceId = resourceId;
        next();
        return;
      }

      if (!user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }

      const userId = user.id ?? user._id?.toString();
      if (!userId) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }

      const hasAccess = await aclService.checkPermission({
        userId,
        role: user.role,
        resourceType: ResourceType.SHARED_LINK,
        resourceId,
        requiredPermission: PermissionBits.VIEW,
      });

      if (!hasAccess) {
        res.status(403).json({ message: 'You do not have permission to view this shared link' });
        return;
      }

      (req as unknown as Record<string, unknown>).shareResourceId = resourceId;
      next();
    });
  };
}
