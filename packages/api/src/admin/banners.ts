import { logger, isValidObjectIdString } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { Response } from 'express';
import type { IBanner } from '@librechat/data-schemas';
import type { ValidationError } from '~/types/error';
import type { ServerRequest } from '~/types/http';
import { parsePagination } from './pagination';

const VALID_BANNER_TYPES: ReadonlySet<string> = new Set(['banner', 'popup']);
const MAX_MESSAGE_LENGTH = 5000;
const MAX_BANNER_ID_LENGTH = 200;

interface BannerIdParams {
  id: string;
}

interface BannerWriteBody {
  bannerId?: string;
  message?: string;
  displayFrom?: string | Date | null;
  displayTo?: string | Date | null;
  type?: string;
  isPublic?: boolean;
  persistable?: boolean;
}

type BannerCreateData = Partial<
  Pick<
    IBanner,
    'bannerId' | 'message' | 'displayFrom' | 'displayTo' | 'type' | 'isPublic' | 'persistable'
  >
>;

type BannerUpdateData = Partial<
  Pick<IBanner, 'message' | 'displayFrom' | 'displayTo' | 'type' | 'isPublic' | 'persistable'>
>;

export interface AdminBannersDeps {
  listBanners: (options?: { limit?: number; offset?: number }) => Promise<IBanner[]>;
  countBanners: () => Promise<number>;
  findBannerById: (id: string | Types.ObjectId) => Promise<IBanner | null>;
  createBanner: (data: BannerCreateData) => Promise<IBanner>;
  updateBannerById: (
    id: string | Types.ObjectId,
    data: BannerUpdateData,
  ) => Promise<IBanner | null>;
  deleteBannerById: (id: string | Types.ObjectId) => Promise<IBanner | null>;
}

function parseDate(value: string | Date | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date;
}

function isValidDateValue(value: string | Date | null | undefined): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
}

/** Creates admin banner handlers with dependency injection for the /api/admin/banners routes. */
export function createAdminBannersHandlers(deps: AdminBannersDeps) {
  const {
    listBanners,
    countBanners,
    findBannerById,
    createBanner,
    updateBannerById,
    deleteBannerById,
  } = deps;

  async function listBannersHandler(req: ServerRequest, res: Response) {
    try {
      const { limit, offset } = parsePagination(req.query as { limit?: string; offset?: string });
      const [banners, total] = await Promise.all([listBanners({ limit, offset }), countBanners()]);
      return res.status(200).json({ banners, total, limit, offset });
    } catch (error) {
      logger.error('[adminBanners] listBanners error:', error);
      return res.status(500).json({ error: 'Failed to list banners' });
    }
  }

  async function getBannerHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as BannerIdParams;
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid banner ID format' });
      }
      const banner = await findBannerById(id);
      if (!banner) {
        return res.status(404).json({ error: 'Banner not found' });
      }
      return res.status(200).json({ banner });
    } catch (error) {
      logger.error('[adminBanners] getBanner error:', error);
      return res.status(500).json({ error: 'Failed to get banner' });
    }
  }

  function validateWriteBody(body: BannerWriteBody, partial: boolean): string | null {
    const messageProvided = body.message !== undefined;
    if (!partial && !messageProvided) {
      return 'message is required';
    }
    if (messageProvided) {
      if (typeof body.message !== 'string' || !body.message.trim()) {
        return 'message must be a non-empty string';
      }
      if (body.message.length > MAX_MESSAGE_LENGTH) {
        return `message must not exceed ${MAX_MESSAGE_LENGTH} characters`;
      }
    }
    if (body.bannerId !== undefined) {
      if (typeof body.bannerId !== 'string' || !body.bannerId.trim()) {
        return 'bannerId must be a non-empty string';
      }
      if (body.bannerId.length > MAX_BANNER_ID_LENGTH) {
        return `bannerId must not exceed ${MAX_BANNER_ID_LENGTH} characters`;
      }
    }
    if (body.type !== undefined && !VALID_BANNER_TYPES.has(body.type)) {
      return `type must be one of: ${Array.from(VALID_BANNER_TYPES).join(', ')}`;
    }
    if (body.isPublic !== undefined && typeof body.isPublic !== 'boolean') {
      return 'isPublic must be a boolean';
    }
    if (body.persistable !== undefined && typeof body.persistable !== 'boolean') {
      return 'persistable must be a boolean';
    }
    if (body.displayFrom !== undefined && !isValidDateValue(body.displayFrom)) {
      return 'displayFrom must be a valid date or null';
    }
    if (body.displayTo !== undefined && !isValidDateValue(body.displayTo)) {
      return 'displayTo must be a valid date or null';
    }
    return null;
  }

  async function createBannerHandler(req: ServerRequest, res: Response) {
    try {
      const body = (req.body ?? {}) as BannerWriteBody;
      const error = validateWriteBody(body, false);
      if (error) {
        return res.status(400).json({ error });
      }

      const data: BannerCreateData = {
        message: body.message?.trim(),
      };
      if (body.bannerId !== undefined) {
        data.bannerId = body.bannerId.trim();
      }
      const displayFrom = parseDate(body.displayFrom);
      if (displayFrom !== undefined) {
        data.displayFrom = displayFrom ?? new Date();
      }
      const displayTo = parseDate(body.displayTo);
      if (displayTo !== undefined) {
        data.displayTo = displayTo ?? undefined;
      }
      if (body.type !== undefined) {
        data.type = body.type as IBanner['type'];
      }
      if (body.isPublic !== undefined) {
        data.isPublic = body.isPublic;
      }
      if (body.persistable !== undefined) {
        data.persistable = body.persistable;
      }

      const banner = await createBanner(data);
      return res.status(201).json({ banner });
    } catch (error) {
      if ((error as ValidationError).name === 'ValidationError') {
        return res.status(400).json({ error: (error as ValidationError).message });
      }
      logger.error('[adminBanners] createBanner error:', error);
      return res.status(500).json({ error: 'Failed to create banner' });
    }
  }

  async function updateBannerHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as BannerIdParams;
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid banner ID format' });
      }
      const body = (req.body ?? {}) as BannerWriteBody;
      const validationError = validateWriteBody(body, true);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const updateData: BannerUpdateData = {};
      if (body.message !== undefined) {
        updateData.message = body.message!.trim();
      }
      if (body.displayFrom !== undefined) {
        const parsed = parseDate(body.displayFrom);
        updateData.displayFrom = (parsed ?? new Date()) as Date;
      }
      if (body.displayTo !== undefined) {
        const parsed = parseDate(body.displayTo);
        updateData.displayTo = (parsed ?? undefined) as Date | undefined;
      }
      if (body.type !== undefined) {
        updateData.type = body.type as IBanner['type'];
      }
      if (body.isPublic !== undefined) {
        updateData.isPublic = body.isPublic;
      }
      if (body.persistable !== undefined) {
        updateData.persistable = body.persistable;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const banner = await updateBannerById(id, updateData);
      if (!banner) {
        return res.status(404).json({ error: 'Banner not found' });
      }
      return res.status(200).json({ banner });
    } catch (error) {
      if ((error as ValidationError).name === 'ValidationError') {
        return res.status(400).json({ error: (error as ValidationError).message });
      }
      logger.error('[adminBanners] updateBanner error:', error);
      return res.status(500).json({ error: 'Failed to update banner' });
    }
  }

  async function deleteBannerHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as BannerIdParams;
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid banner ID format' });
      }
      const deleted = await deleteBannerById(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Banner not found' });
      }
      return res.status(200).json({ success: true, id });
    } catch (error) {
      logger.error('[adminBanners] deleteBanner error:', error);
      return res.status(500).json({ error: 'Failed to delete banner' });
    }
  }

  return {
    listBanners: listBannersHandler,
    getBanner: getBannerHandler,
    createBanner: createBannerHandler,
    updateBanner: updateBannerHandler,
    deleteBanner: deleteBannerHandler,
  };
}
