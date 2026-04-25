import { logger } from '@librechat/data-schemas';
import type { IBanner, CreateBannerRequest, UpdateBannerRequest } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { parsePagination } from './pagination';

interface BannerIdParams {
  id: string;
}

export interface AdminBannersDeps {
  createBanner: (bannerData: CreateBannerRequest) => Promise<IBanner>;
  listBanners: (options: {
    page: number;
    limit: number;
    filter?: Record<string, unknown>;
    tenantId?: string;
  }) => Promise<{ banners: IBanner[]; total: number; page: number; totalPages: number }>;
  getBannerById: (id: string) => Promise<IBanner | null>;
  updateBanner: (
    id: string,
    updates: UpdateBannerRequest,
    bannerId?: undefined,
    tenantId?: string,
  ) => Promise<IBanner | null>;
  deleteBanner: (id: string, bannerId?: undefined, tenantId?: string) => Promise<boolean>;
  toggleBanner: (id: string, bannerId?: undefined, tenantId?: string) => Promise<IBanner | null>;
}

export function createAdminBannersHandlers(deps: AdminBannersDeps) {
  const { createBanner, listBanners, getBannerById, updateBanner, deleteBanner, toggleBanner } =
    deps;

  /**
   * POST /api/admin/banners
   * Create a new banner
   */
  async function createBannerHandler(req: ServerRequest, res: Response) {
    try {
      const body = req.body as CreateBannerRequest;
      const bannerData: CreateBannerRequest = {
        ...body,
        tenantId: req.user?.tenantId,
      };

      const banner = await createBanner(bannerData);
      res.status(201).json(banner);
    } catch (error) {
      logger.error('[POST /admin/banners] Error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (
        errorMessage.includes('required') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('after')
      ) {
        return res.status(400).json({ message: errorMessage });
      }

      res.status(500).json({ message: 'Error creating banner' });
    }
  }

  /**
   * GET /api/admin/banners
   * List all banners (paginated)
   */
  async function listBannersHandler(req: ServerRequest, res: Response) {
    try {
      const { limit, offset } = parsePagination(req.query);
      const page = Math.floor(offset / limit) + 1;
      const { audienceMode, isActive } = req.query;

      const filter: Record<string, unknown> = {};

      if (audienceMode && typeof audienceMode === 'string') {
        filter.audienceMode = audienceMode;
      }

      if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
      }

      const result = await listBanners({
        page,
        limit,
        filter,
        tenantId: req.user?.tenantId,
      });

      res.json(result);
    } catch (error) {
      logger.error('[GET /admin/banners] Error:', error);
      res.status(500).json({ message: 'Error listing banners' });
    }
  }

  /**
   * GET /api/admin/banners/:id
   * Get a specific banner
   */
  async function getBannerHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as BannerIdParams;
      const banner = await getBannerById(id);

      if (!banner) {
        return res.status(404).json({ message: 'Banner not found' });
      }

      // Check tenantId
      if (
        typeof banner === 'object' &&
        banner !== null &&
        'tenantId' in banner &&
        banner.tenantId &&
        banner.tenantId !== req.user?.tenantId
      ) {
        return res.status(403).json({ message: 'Access denied' });
      }

      res.json(banner);
    } catch (error) {
      logger.error('[GET /admin/banners/:id] Error:', error);
      res.status(500).json({ message: 'Error getting banner' });
    }
  }

  /**
   * PUT /api/admin/banners/:id
   * Update a banner
   */
  async function updateBannerHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as BannerIdParams;
      const body = req.body as UpdateBannerRequest;

      // Prevent changing tenantId
      const updates: UpdateBannerRequest = { ...body };

      const banner = await updateBanner(id, updates, undefined, req.user?.tenantId);

      if (!banner) {
        return res.status(404).json({ message: 'Banner not found' });
      }

      res.json(banner);
    } catch (error) {
      logger.error('[PUT /admin/banners/:id] Error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (
        errorMessage.includes('required') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('after')
      ) {
        return res.status(400).json({ message: errorMessage });
      }

      res.status(500).json({ message: 'Error updating banner' });
    }
  }

  /**
   * DELETE /api/admin/banners/:id
   * Delete a banner
   */
  async function deleteBannerHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as BannerIdParams;
      const deleted = await deleteBanner(id, undefined, req.user?.tenantId);

      if (!deleted) {
        return res.status(404).json({ message: 'Banner not found' });
      }

      res.json({ message: 'Banner deleted successfully' });
    } catch (error) {
      logger.error('[DELETE /admin/banners/:id] Error:', error);
      res.status(500).json({ message: 'Error deleting banner' });
    }
  }

  /**
   * PATCH /api/admin/banners/:id/toggle
   * Toggle banner active status
   */
  async function toggleBannerHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as BannerIdParams;
      const banner = await toggleBanner(id, undefined, req.user?.tenantId);

      if (!banner) {
        return res.status(404).json({ message: 'Banner not found' });
      }

      res.json(banner);
    } catch (error) {
      logger.error('[PATCH /admin/banners/:id/toggle] Error:', error);
      res.status(500).json({ message: 'Error toggling banner' });
    }
  }

  return {
    createBanner: createBannerHandler,
    listBanners: listBannersHandler,
    getBanner: getBannerHandler,
    updateBanner: updateBannerHandler,
    deleteBanner: deleteBannerHandler,
    toggleBanner: toggleBannerHandler,
  };
}
