import type { Model, ClientSession, FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import logger from '~/config/winston';
import type {
  IBanner,
  IUser,
  IRole,
  IGroup,
  CreateBannerRequest,
  UpdateBannerRequest,
} from '~/types';

export function createBannerMethods(mongoose: typeof import('mongoose')) {
  /**
   * Get all active banners for a specific user based on their principals (role, groups).
   * Replaces the legacy getBanner() but maintains backward compatibility.
   *
   * @param user - The user object (null for unauthenticated users)
   * @param options - Optional configuration (limit, session)
   * @returns Array of active banners sorted by priority
   */
  async function getActiveBanners(
    user?: IUser | null,
    options?: {
      limit?: number;
      session?: ClientSession;
    },
  ): Promise<IBanner[]> {
    const Banner = mongoose.models.Banner as Model<IBanner>;
    const now = new Date();
    const limit = options?.limit || 10;
    const tenantId = user?.tenantId;
    const tenantScope = tenantId
      ? [{ tenantId }, { tenantId: { $exists: false } }, { tenantId: null }]
      : [{ tenantId: { $exists: false } }, { tenantId: null }];

    try {
      // Base query: active banners within date range
      const baseQuery: FilterQuery<IBanner> = {
        displayFrom: { $lte: now },
        $and: [
          {
            $or: [{ displayTo: { $gte: now } }, { displayTo: null }],
          },
          {
            $or: tenantScope,
          },
        ],
        type: 'banner',
        isActive: { $ne: false }, // true or undefined
      };

      // If no user, return only public banners
      if (!user) {
        const query = Banner.find({
          ...baseQuery,
          isPublic: true,
        })
          .sort({ priority: -1, order: 1, displayFrom: -1 })
          .limit(limit);

        if (options?.session) {
          query.session(options.session);
        }

        return query.lean();
      }

      // Get user's groups
      const Group = mongoose.models.Group as Model<IGroup>;
      const User = mongoose.models.User as Model<IUser>;

      // Find user's idOnTheSource for group lookup
      const userQuery = User.findById(user._id, 'idOnTheSource').lean();
      if (options?.session) {
        userQuery.session(options.session);
      }
      const userDoc = await userQuery;
      const userIdOnTheSource = userDoc?.idOnTheSource || user._id.toString();

      // Find all groups the user is a member of
      const groupQuery = Group.find({ memberIds: userIdOnTheSource }, '_id').lean();
      if (options?.session) {
        groupQuery.session(options.session);
      }
      const userGroups = await groupQuery;

      const groupIds = userGroups.map((g) => g._id.toString());

      // Build audience query conditions
      const audienceConditions: FilterQuery<IBanner>[] = [
        // Legacy banners (no audienceMode) - show to everyone
        { audienceMode: { $exists: false } },

        // Global banners
        { audienceMode: 'global' },

        // Public banners
        { isPublic: true },

        // Banners targeted to this specific user
        {
          audienceMode: 'user',
          targetUserIds: { $in: [user._id.toString()] },
        },
      ];

      // Add role condition if user has a role
      if (user.role) {
        audienceConditions.push({
          audienceMode: 'role',
          targetRoleIds: { $in: [user.role] },
        });
      }

      // Add group conditions if user is in any groups
      if (groupIds.length > 0) {
        audienceConditions.push({
          audienceMode: 'group',
          targetGroupIds: { $in: groupIds },
        });
      }

      // Execute query
      const query = Banner.find({
        ...baseQuery,
        $or: audienceConditions,
      })
        .sort({ priority: -1, order: 1, displayFrom: -1 })
        .limit(limit);

      if (options?.session) {
        query.session(options.session);
      }

      const banners = await query.lean();

      logger.debug(`[getActiveBanners] Found ${banners.length} banners for user ${user._id}`);

      return banners;
    } catch (error) {
      logger.error('[getActiveBanners] Error:', error);
      throw new Error('Error getting active banners');
    }
  }

  /**
   * Legacy method - returns first active banner.
   * Maintains backward compatibility with existing code.
   */
  async function getBanner(user?: IUser | null): Promise<IBanner | null> {
    try {
      const banners = await getActiveBanners(user, { limit: 1 });
      return banners[0] || null;
    } catch (error) {
      logger.error('[getBanner] Error getting banner', error);
      throw new Error('Error getting banners');
    }
  }

  /**
   * Create a new banner with validation.
   */
  async function createBanner(
    data: CreateBannerRequest,
    session?: ClientSession,
  ): Promise<IBanner> {
    const Banner = mongoose.models.Banner as Model<IBanner>;

    try {
      // Validate required fields
      if (!data.message?.trim()) {
        throw new Error('Banner message is required');
      }

      // Validate date range
      if (data.displayTo && data.displayFrom && data.displayTo < data.displayFrom) {
        throw new Error('displayTo must be after displayFrom');
      }

      // Validate audience
      if (data.audienceMode === 'role' && data.targetRoleIds?.length) {
        await validateRolesExist(data.targetRoleIds);
      }

      if (data.audienceMode === 'group' && data.targetGroupIds?.length) {
        await validateGroupsExist(data.targetGroupIds);
      }

      if (data.audienceMode === 'user' && data.targetUserIds?.length) {
        await validateUsersExist(data.targetUserIds);
      }

      // Generate unique bannerId
      const bannerId = uuidv4();

      // Create banner
      const bannerData = {
        ...data,
        bannerId,
        message: data.message.trim(),
        displayFrom: data.displayFrom || new Date(),
        isActive: data.isActive ?? true,
        priority: data.priority ?? 50,
        order: data.order ?? 0,
        viewCount: 0,
        dismissCount: 0,
      };

      const banner = await Banner.create([bannerData], { session });

      logger.info(`[createBanner] Created banner ${bannerId}`);

      return banner[0];
    } catch (error) {
      logger.error('[createBanner] Error:', error);
      throw error;
    }
  }

  /**
   * Update an existing banner.
   */
  async function updateBanner(
    bannerId: string,
    updates: UpdateBannerRequest,
    session?: ClientSession,
    tenantId?: string,
  ): Promise<IBanner | null> {
    const Banner = mongoose.models.Banner as Model<IBanner>;

    try {
      // Validate message if provided
      if (updates.message) {
        updates.message = updates.message.trim();
        if (!updates.message) {
          throw new Error('Banner message cannot be empty');
        }
      }

      // Validate date range
      if (updates.displayTo && updates.displayFrom && updates.displayTo < updates.displayFrom) {
        throw new Error('displayTo must be after displayFrom');
      }

      // Validate audience if changed
      if (updates.audienceMode === 'role' && updates.targetRoleIds?.length) {
        await validateRolesExist(updates.targetRoleIds);
      }

      if (updates.audienceMode === 'group' && updates.targetGroupIds?.length) {
        await validateGroupsExist(updates.targetGroupIds);
      }

      if (updates.audienceMode === 'user' && updates.targetUserIds?.length) {
        await validateUsersExist(updates.targetUserIds);
      }

      // Remove bannerId from updates (immutable)
      const safeUpdates: Record<string, unknown> = { ...updates };
      delete safeUpdates.bannerId;
      const filter: FilterQuery<IBanner> = { bannerId } as FilterQuery<IBanner>;
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      const query = Banner.findOneAndUpdate(filter, { $set: safeUpdates }, { new: true });

      if (session) {
        query.session(session);
      }

      const banner = await query;

      if (banner) {
        logger.info(`[updateBanner] Updated banner ${bannerId}`);
      } else {
        logger.warn(`[updateBanner] Banner not found: ${bannerId}`);
      }

      return banner;
    } catch (error) {
      logger.error('[updateBanner] Error:', error);
      throw error;
    }
  }

  /**
   * Delete a banner.
   */
  async function deleteBanner(
    bannerId: string,
    session?: ClientSession,
    tenantId?: string,
  ): Promise<boolean> {
    const Banner = mongoose.models.Banner as Model<IBanner>;

    try {
      const filter: FilterQuery<IBanner> = { bannerId };
      if (tenantId) {
        filter.tenantId = tenantId;
      }
      const query = Banner.deleteOne(filter);

      if (session) {
        query.session(session);
      }

      const result = await query;

      if (result.deletedCount > 0) {
        logger.info(`[deleteBanner] Deleted banner ${bannerId}`);
        return true;
      }

      logger.warn(`[deleteBanner] Banner not found: ${bannerId}`);
      return false;
    } catch (error) {
      logger.error('[deleteBanner] Error:', error);
      throw error;
    }
  }

  /**
   * List banners with pagination and filters.
   */
  async function listBanners(options: {
    page?: number;
    limit?: number;
    filter?: Record<string, unknown>;
    tenantId?: string;
    session?: ClientSession;
  }): Promise<{ banners: IBanner[]; total: number; page: number; totalPages: number }> {
    const Banner = mongoose.models.Banner as Model<IBanner>;
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    try {
      const query: FilterQuery<IBanner> = { ...(options.filter || {}) } as FilterQuery<IBanner>;

      if (options.tenantId) {
        query.tenantId = options.tenantId;
      }

      const findQuery = Banner.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);

      const countQuery = Banner.countDocuments(query);

      if (options.session) {
        findQuery.session(options.session);
        countQuery.session(options.session);
      }

      const [banners, total] = await Promise.all([findQuery.lean(), countQuery]);

      const totalPages = Math.ceil(total / limit);

      return { banners, total, page, totalPages };
    } catch (error) {
      logger.error('[listBanners] Error:', error);
      throw error;
    }
  }

  /**
   * Toggle banner active status.
   */
  async function toggleBanner(
    bannerId: string,
    session?: ClientSession,
    tenantId?: string,
  ): Promise<IBanner | null> {
    const Banner = mongoose.models.Banner as Model<IBanner>;

    try {
      const filter: FilterQuery<IBanner> = { bannerId };
      if (tenantId) {
        filter.tenantId = tenantId;
      }
      const findQuery = Banner.findOne(filter);

      if (session) {
        findQuery.session(session);
      }

      const banner = await findQuery;

      if (!banner) {
        logger.warn(`[toggleBanner] Banner not found: ${bannerId}`);
        return null;
      }

      // Toggle isActive field
      banner.isActive = !banner.isActive;
      await banner.save({ session });

      logger.info(
        `[toggleBanner] Toggled banner ${bannerId} to ${banner.isActive ? 'active' : 'inactive'}`,
      );

      return banner;
    } catch (error) {
      logger.error('[toggleBanner] Error:', error);
      throw error;
    }
  }

  /**
   * Get banner by ID.
   */
  async function getBannerById(
    bannerId: string,
    session?: ClientSession,
    tenantId?: string,
  ): Promise<IBanner | null> {
    const Banner = mongoose.models.Banner as Model<IBanner>;

    try {
      const filter: FilterQuery<IBanner> = { bannerId };
      if (tenantId) {
        filter.tenantId = tenantId;
      }
      const query = Banner.findOne(filter);

      if (session) {
        query.session(session);
      }

      return await query.lean();
    } catch (error) {
      logger.error('[getBannerById] Error:', error);
      throw error;
    }
  }

  // ===== Validation Helpers =====

  /**
   * Validate that roles exist in the database.
   */
  async function validateRolesExist(roleIds: string[]): Promise<void> {
    const Role = mongoose.models.Role as Model<IRole>;

    const existingRoles = await Role.find({
      name: { $in: roleIds },
    })
      .select('name')
      .lean();

    const existingNames = existingRoles.map((r: { name: string }) => r.name);
    const missing = roleIds.filter((id) => !existingNames.includes(id));

    if (missing.length > 0) {
      throw new Error(`Roles not found: ${missing.join(', ')}`);
    }
  }

  /**
   * Validate that groups exist in the database.
   */
  async function validateGroupsExist(groupIds: string[]): Promise<void> {
    const Group = mongoose.models.Group as Model<IGroup>;

    const objectIds = groupIds.map((id) => {
      try {
        return new Types.ObjectId(id);
      } catch {
        throw new Error(`Invalid group ID: ${id}`);
      }
    });

    const existingGroups = await Group.find({
      _id: { $in: objectIds },
    })
      .select('_id')
      .lean();

    if (existingGroups.length !== groupIds.length) {
      throw new Error('Some groups do not exist');
    }
  }

  /**
   * Validate that users exist in the database.
   */
  async function validateUsersExist(userIds: string[]): Promise<void> {
    const User = mongoose.models.User as Model<IUser>;

    const objectIds = userIds.map((id) => {
      try {
        return new Types.ObjectId(id);
      } catch {
        throw new Error(`Invalid user ID: ${id}`);
      }
    });

    const existingUsers = await User.find({
      _id: { $in: objectIds },
    })
      .select('_id')
      .lean();

    if (existingUsers.length !== userIds.length) {
      throw new Error('Some users do not exist');
    }
  }

  return {
    getBanner,
    getActiveBanners,
    createBanner,
    updateBanner,
    deleteBanner,
    listBanners,
    toggleBanner,
    getBannerById,
    validateRolesExist,
    validateGroupsExist,
    validateUsersExist,
  };
}

export type BannerMethods = ReturnType<typeof createBannerMethods>;
