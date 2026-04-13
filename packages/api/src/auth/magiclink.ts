import { Types } from 'mongoose';
import { hashToken, getRandomValues } from '@librechat/data-schemas';
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
    const { email } = req.body as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ message: 'Valid email is required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
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
  }

  async function revoke(req: Request, res: Response): Promise<void> {
    const link = await deps.findMagicLinkById(req.params.id);
    if (!link) {
      res.status(404).json({ message: 'Magic link not found' });
      return;
    }
    await deps.updateMagicLink(req.params.id, { active: false });
    res.status(204).send();
  }

  async function list(req: Request, res: Response): Promise<void> {
    const links = await deps.listMagicLinks({
      createdBy: (req.user as { _id: Types.ObjectId })._id,
    });
    res.json(links.map(toView));
  }

  return { generate, revoke, list };
}
