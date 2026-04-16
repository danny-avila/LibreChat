import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IBanner, IUser, IRole, IGroup } from '..';
import { createBannerMethods } from './banner';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let Banner: mongoose.Model<IBanner>;
let User: mongoose.Model<IUser>;
let Role: mongoose.Model<IRole>;
let Group: mongoose.Model<IGroup>;
let methods: ReturnType<typeof createBannerMethods>;

describe('Banner Methods', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    createModels(mongoose);
    Banner = mongoose.models.Banner as mongoose.Model<IBanner>;
    User = mongoose.models.User as mongoose.Model<IUser>;
    Role = mongoose.models.Role as mongoose.Model<IRole>;
    Group = mongoose.models.Group as mongoose.Model<IGroup>;

    methods = createBannerMethods(mongoose);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Banner.deleteMany({});
    await User.deleteMany({});
    await Role.deleteMany({});
    await Group.deleteMany({});
  });

  describe('createBanner', () => {
    it('should create a banner with required fields', async () => {
      const bannerData = {
        message: 'Test Banner',
        audienceMode: 'global' as const,
      };

      const result = await methods.createBanner(bannerData);

      expect(result).toBeDefined();
      expect(result.message).toBe('Test Banner');
      expect(result.audienceMode).toBe('global');
      expect(result.bannerId).toBeDefined();
      expect(result.isActive).toBe(true);
      expect(result.priority).toBe(50);
    });

    it('should reject empty message', async () => {
      await expect(methods.createBanner({ message: '   ' })).rejects.toThrow(
        'Banner message is required',
      );
    });

    it('should reject invalid date range', async () => {
      const bannerData = {
        message: 'Test',
        displayFrom: new Date('2026-12-31'),
        displayTo: new Date('2026-01-01'),
      };

      await expect(methods.createBanner(bannerData)).rejects.toThrow(
        'displayTo must be after displayFrom',
      );
    });

    it('should create banner with custom values', async () => {
      const bannerData = {
        message: 'Custom Banner',
        priority: 90,
        order: 5,
        isActive: false,
        audienceMode: 'global' as const,
      };

      const result = await methods.createBanner(bannerData);

      expect(result.priority).toBe(90);
      expect(result.order).toBe(5);
      expect(result.isActive).toBe(false);
    });
  });

  describe('getActiveBanners', () => {
    it('should return active banners for unauthenticated users', async () => {
      await methods.createBanner({
        message: 'Public Banner',
        isPublic: true,
        audienceMode: 'global',
      });

      await methods.createBanner({
        message: 'Private Banner',
        isPublic: false,
        audienceMode: 'global',
      });

      const result = await methods.getActiveBanners(null);

      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('Public Banner');
    });

    it('should filter out inactive banners', async () => {
      await methods.createBanner({
        message: 'Active Banner',
        isPublic: true,
        isActive: true,
      });

      await methods.createBanner({
        message: 'Inactive Banner',
        isPublic: true,
        isActive: false,
      });

      const result = await methods.getActiveBanners(null);

      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('Active Banner');
    });

    it('should filter by date range', async () => {
      const past = new Date('2020-01-01');
      const future = new Date('2030-01-01');

      await methods.createBanner({
        message: 'Current Banner',
        isPublic: true,
        displayFrom: new Date('2026-01-01'),
        displayTo: future,
      });

      await methods.createBanner({
        message: 'Past Banner',
        isPublic: true,
        displayFrom: past,
        displayTo: new Date('2020-12-31'),
      });

      const result = await methods.getActiveBanners(null);

      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('Current Banner');
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await methods.createBanner({
          message: `Banner ${i}`,
          isPublic: true,
          priority: i,
        });
      }

      const result = await methods.getActiveBanners(null, { limit: 3 });

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should sort by priority', async () => {
      await methods.createBanner({
        message: 'Low Priority',
        isPublic: true,
        priority: 10,
      });

      await methods.createBanner({
        message: 'High Priority',
        isPublic: true,
        priority: 90,
      });

      const result = await methods.getActiveBanners(null);

      expect(result[0].message).toBe('High Priority');
    });
  });

  describe('updateBanner', () => {
    it('should update existing banner', async () => {
      const banner = await methods.createBanner({
        message: 'Original',
        audienceMode: 'global',
      });

      const updated = await methods.updateBanner(banner.bannerId, {
        message: 'Updated',
        priority: 90,
      });

      expect(updated).toBeDefined();
      expect(updated?.message).toBe('Updated');
      expect(updated?.priority).toBe(90);
    });

    it('should return null for non-existent banner', async () => {
      const result = await methods.updateBanner('nonexistent-id', { message: 'Test' });

      expect(result).toBeNull();
    });

    it('should reject empty message', async () => {
      const banner = await methods.createBanner({
        message: 'Original',
      });

      await expect(methods.updateBanner(banner.bannerId, { message: '   ' })).rejects.toThrow(
        'Banner message cannot be empty',
      );
    });

    it('should not allow bannerId change', async () => {
      const banner = await methods.createBanner({
        message: 'Test',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invalidUpdate: any = {
        bannerId: 'new-id',
        message: 'Updated',
      };

      const updated = await methods.updateBanner(banner.bannerId, invalidUpdate);

      expect(updated?.bannerId).toBe(banner.bannerId);
    });
  });

  describe('deleteBanner', () => {
    it('should delete existing banner', async () => {
      const banner = await methods.createBanner({
        message: 'To Delete',
      });

      const result = await methods.deleteBanner(banner.bannerId);

      expect(result).toBe(true);

      const found = await Banner.findOne({ bannerId: banner.bannerId });
      expect(found).toBeNull();
    });

    it('should return false for non-existent banner', async () => {
      const result = await methods.deleteBanner('nonexistent-id');

      expect(result).toBe(false);
    });
  });

  describe('toggleBanner', () => {
    it('should toggle banner from active to inactive', async () => {
      const banner = await methods.createBanner({
        message: 'Test',
        isActive: true,
      });

      const toggled = await methods.toggleBanner(banner.bannerId);

      expect(toggled).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((toggled as any).isActive).toBe(false);
    });

    it('should toggle banner from inactive to active', async () => {
      const banner = await methods.createBanner({
        message: 'Test',
        isActive: false,
      });

      const toggled = await methods.toggleBanner(banner.bannerId);

      expect(toggled).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((toggled as any).isActive).toBe(true);
    });

    it('should return null for non-existent banner', async () => {
      const result = await methods.toggleBanner('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('listBanners', () => {
    it('should return paginated banners', async () => {
      for (let i = 0; i < 5; i++) {
        await methods.createBanner({
          message: `Banner ${i}`,
        });
      }

      const result = await methods.listBanners({ page: 1, limit: 2 });

      expect(result.banners).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(3);
    });

    it('should apply filters', async () => {
      await methods.createBanner({
        message: 'Active Global',
        isActive: true,
        audienceMode: 'global',
      });

      await methods.createBanner({
        message: 'Active Role',
        isActive: true,
        audienceMode: 'role',
      });

      await methods.createBanner({
        message: 'Inactive Global',
        isActive: false,
        audienceMode: 'global',
      });

      const result = await methods.listBanners({
        filter: { isActive: true, audienceMode: 'global' },
      });

      expect(result.banners).toHaveLength(1);
      expect(result.banners[0].message).toBe('Active Global');
    });

    it('should handle pagination correctly', async () => {
      for (let i = 0; i < 25; i++) {
        await methods.createBanner({
          message: `Banner ${i}`,
        });
      }

      const page1 = await methods.listBanners({ page: 1, limit: 10 });
      const page2 = await methods.listBanners({ page: 2, limit: 10 });

      expect(page1.banners).toHaveLength(10);
      expect(page2.banners).toHaveLength(10);
      expect(page1.totalPages).toBe(3);
    });
  });

  describe('getBannerById', () => {
    it('should return banner by bannerId', async () => {
      const banner = await methods.createBanner({
        message: 'Test Banner',
      });

      const found = await methods.getBannerById(banner.bannerId);

      expect(found).toBeDefined();
      expect(found?.message).toBe('Test Banner');
    });

    it('should return null for non-existent banner', async () => {
      const result = await methods.getBannerById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('getBanner', () => {
    it('should return first active banner', async () => {
      await methods.createBanner({
        message: 'Banner 1',
        isPublic: true,
        priority: 10,
      });

      await methods.createBanner({
        message: 'Banner 2',
        isPublic: true,
        priority: 90,
      });

      const result = await methods.getBanner(null);

      expect(result).toBeDefined();
      expect(result?.message).toBe('Banner 2'); // Higher priority
    });

    it('should return null when no banners', async () => {
      const result = await methods.getBanner(null);

      expect(result).toBeNull();
    });
  });
});
