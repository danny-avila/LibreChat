import { Types } from 'mongoose';
import { hashToken, getRandomValues, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { IMagicLink, MagicLinkView } from '@librechat/data-schemas';

export interface MagicLinkDeps {
  createMagicLink: (data: {
    token: string;
    email: string;
    createdBy: Types.ObjectId | string;
    tenantId?: string;
  }) => Promise<IMagicLink>;
  findMagicLink: (
    query: Partial<{ token: string; email: string; active: boolean }>,
  ) => Promise<IMagicLink | null>;
  findMagicLinkById: (id: string) => Promise<IMagicLink | null>;
  updateMagicLink: (
    id: string,
    update: Partial<Pick<IMagicLink, 'active' | 'userId' | 'useCount' | 'lastUsedAt'>>,
  ) => Promise<IMagicLink | null>;
  listMagicLinks: (filter: { createdBy?: string | Types.ObjectId }) => Promise<IMagicLink[]>;
  isEmailDomainAllowed: (email: string) => boolean;
}

function toView(link: IMagicLink): MagicLinkView {
  return {
    id: (link._id as Types.ObjectId).toString(),
    email: link.email,
    createdBy: link.createdBy.toString(),
    active: link.active,
    useCount: link.useCount,
    lastUsedAt: link.lastUsedAt,
    createdAt: link.createdAt,
    userId: link.userId?.toString(),
  };
}

export function createMagicLinkHandlers(deps: MagicLinkDeps) {
  async function generate(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body as { email?: string };
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ message: 'Valid email is required' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();

      if (!deps.isEmailDomainAllowed(normalizedEmail)) {
        res.status(400).json({ message: 'Email domain not allowed' });
        return;
      }

      const existing = await deps.findMagicLink({ email: normalizedEmail, active: true });
      if (existing) {
        res.status(409).json({ message: 'An active magic link already exists for this email' });
        return;
      }

      const rawToken = await getRandomValues(32);
      const hash = await hashToken(rawToken);
      const link = await deps.createMagicLink({
        token: hash,
        email: normalizedEmail,
        createdBy: (req.user as { _id: Types.ObjectId })._id,
      });

      res.status(201).json({
        ...toView(link),
        url: `/auth/magic-link?token=${rawToken}`,
      });
    } catch (err) {
      logger.error('[MagicLink.generate]', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async function revoke(req: Request, res: Response): Promise<void> {
    try {
      const link = await deps.findMagicLinkById(req.params.id);
      if (!link) {
        res.status(404).json({ message: 'Magic link not found' });
        return;
      }

      const adminId = (req.user as { _id: Types.ObjectId; role?: string })._id;
      const isAdmin = (req.user as { role?: string }).role === 'ADMIN';
      if (!isAdmin && link.createdBy.toString() !== adminId.toString()) {
        res.status(403).json({ message: 'Forbidden' });
        return;
      }

      await deps.updateMagicLink(req.params.id, { active: false });
      res.status(204).send();
    } catch (err) {
      logger.error('[MagicLink.revoke]', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async function list(req: Request, res: Response): Promise<void> {
    try {
      const { createdBy } = req.query as { createdBy?: string };
      const filter: { createdBy?: string | Types.ObjectId } = {};
      if (createdBy) {
        filter.createdBy = createdBy;
      }
      const links = await deps.listMagicLinks(filter);
      res.json(links.map(toView));
    } catch (err) {
      logger.error('[MagicLink.list]', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  return { generate, revoke, list };
}
