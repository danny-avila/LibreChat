import { logger } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

/** Storage guard rather than a membership cap: conversation pinning itself is
 *  unbounded, so this only has to stay above any list a sidebar can show. The
 *  client surfaces a rejection instead of silently dropping the new order. */
const MAX_PINNED_ORDER_ENTRIES = 1000;

/** The longest key a valid entry can produce is a model favorite's
 *  `model:${endpoint}::${model}`: the favorites endpoint accepts 256 characters
 *  for each half, so 6 + 256 + 2 + 256. */
const MAX_PINNED_ORDER_KEY_LENGTH = 520;

export interface PinnedOrderHandlersDeps {
  /** User read/write — from `@librechat/data-schemas` `createMethods` output. */
  getUserById: (userId: string, fieldsToSelect?: string) => Promise<IUser | null>;
  updateUser: (userId: string, updateData: Partial<IUser>) => Promise<IUser | null>;
}

function validatePinnedOrder(pinnedOrder: unknown, res: Response): string[] | null {
  if (!Array.isArray(pinnedOrder)) {
    res.status(400).json({ message: 'pinnedOrder must be an array' });
    return null;
  }

  if (pinnedOrder.length > MAX_PINNED_ORDER_ENTRIES) {
    res.status(400).json({ message: `Maximum ${MAX_PINNED_ORDER_ENTRIES} entries allowed` });
    return null;
  }

  for (const key of pinnedOrder) {
    if (typeof key !== 'string' || key.length === 0) {
      res.status(400).json({ message: 'Each pinnedOrder entry must be a non-empty string' });
      return null;
    }
    if (key.length > MAX_PINNED_ORDER_KEY_LENGTH) {
      res.status(400).json({
        message: `pinnedOrder entry exceeds maximum length of ${MAX_PINNED_ORDER_KEY_LENGTH}`,
      });
      return null;
    }
  }

  if (new Set(pinnedOrder).size !== pinnedOrder.length) {
    res.status(400).json({ message: 'pinnedOrder entries must be unique' });
    return null;
  }

  return pinnedOrder as string[];
}

/** Combined display order for the sidebar's Pinned section. Keys interleave
 *  favorites and pinned chats (`agent:`, `spec:`, `model:`, `convo:`), so the
 *  two systems keep their own membership while sharing one ordering. */
export function createPinnedOrderHandlers(deps: PinnedOrderHandlersDeps): {
  getPinnedOrder: (req: ServerRequest, res: Response) => Promise<Response>;
  updatePinnedOrder: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  async function getPinnedOrder(req: ServerRequest, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
      const user = await deps.getUserById(userId, 'pinnedOrder');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      return res.status(200).json(user.pinnedOrder ?? []);
    } catch (error) {
      logger.error('[PinnedOrder] Error fetching pinned order:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  async function updatePinnedOrder(req: ServerRequest, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { pinnedOrder } = req.body as { pinnedOrder?: unknown };
    const validated = validatePinnedOrder(pinnedOrder, res);
    if (validated == null) {
      return res;
    }

    try {
      const user = await deps.updateUser(userId, { pinnedOrder: validated });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      return res.status(200).json(user.pinnedOrder ?? []);
    } catch (error) {
      logger.error('[PinnedOrder] Error updating pinned order:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  return { getPinnedOrder, updatePinnedOrder };
}
