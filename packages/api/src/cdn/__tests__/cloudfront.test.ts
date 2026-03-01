import type { CloudFrontConfig } from 'librechat-data-provider';

const mockLogger = { info: jest.fn(), error: jest.fn() };
const mockInitializeS3 = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

jest.mock('../s3', () => ({
  initializeS3: mockInitializeS3,
}));

type RequiredCloudFrontConfig = NonNullable<CloudFrontConfig>;

/** Build a fully-typed config object, filling in all Zod-defaulted fields. */
function makeConfig(overrides: Partial<RequiredCloudFrontConfig> = {}): RequiredCloudFrontConfig {
  return {
    domain: 'https://d123.cloudfront.net',
    invalidateOnDelete: false,
    imageSigning: 'none',
    urlExpiry: 3600,
    ...overrides,
  };
}

describe('CloudFront CDN module', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockInitializeS3.mockReturnValue({});
    delete process.env.CLOUDFRONT_KEY_PAIR_ID;
    delete process.env.CLOUDFRONT_PRIVATE_KEY;
  });

  async function load() {
    jest.mock('@librechat/data-schemas', () => ({ logger: mockLogger }));
    jest.mock('../s3', () => ({ initializeS3: mockInitializeS3 }));
    return import('../cloudfront');
  }

  describe('initializeCloudFront', () => {
    it('returns false when domain is not provided', async () => {
      const { initializeCloudFront } = await load();
      expect(initializeCloudFront({} as never)).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[initializeCloudFront] CloudFront domain is required'),
      );
    });

    it('returns false when S3 is not initialized', async () => {
      mockInitializeS3.mockReturnValue(null);
      const { initializeCloudFront } = await load();
      expect(initializeCloudFront(makeConfig())).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[initializeCloudFront] S3 must be initialized'),
      );
    });

    it('returns true and logs without signing keys when keys are absent', async () => {
      const { initializeCloudFront } = await load();
      expect(initializeCloudFront(makeConfig())).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('without signing keys'));
    });

    it('returns true and logs with signing keys when env vars are set', async () => {
      process.env.CLOUDFRONT_KEY_PAIR_ID = 'K123';
      process.env.CLOUDFRONT_PRIVATE_KEY =
        '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';
      const { initializeCloudFront } = await load();
      expect(initializeCloudFront(makeConfig())).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('with signing keys'));
    });

    it('returns true immediately when already initialized (no re-init)', async () => {
      const { initializeCloudFront } = await load();
      initializeCloudFront(makeConfig());
      jest.clearAllMocks();
      expect(initializeCloudFront(makeConfig({ domain: 'https://different.cloudfront.net' }))).toBe(
        true,
      );
      expect(mockInitializeS3).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('logs cache invalidation message when invalidateOnDelete is enabled', async () => {
      const { initializeCloudFront } = await load();
      initializeCloudFront(makeConfig({ distributionId: 'E123ABC', invalidateOnDelete: true }));
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cache invalidation on delete enabled'),
      );
    });

    it('does not log cache invalidation message when invalidateOnDelete is false', async () => {
      const { initializeCloudFront } = await load();
      initializeCloudFront(makeConfig({ invalidateOnDelete: false }));
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Cache invalidation'),
      );
    });
  });

  describe('getCloudFrontConfig', () => {
    it('returns null before initialization', async () => {
      const { getCloudFrontConfig } = await load();
      expect(getCloudFrontConfig()).toBeNull();
    });

    it('returns config with domain after initialization', async () => {
      const { initializeCloudFront, getCloudFrontConfig } = await load();
      initializeCloudFront(makeConfig());
      expect(getCloudFrontConfig()?.domain).toBe('https://d123.cloudfront.net');
    });

    it('returns config with null signing keys when env vars absent', async () => {
      const { initializeCloudFront, getCloudFrontConfig } = await load();
      initializeCloudFront(makeConfig());
      const config = getCloudFrontConfig();
      expect(config?.privateKey).toBeNull();
      expect(config?.keyPairId).toBeNull();
    });

    it('returns config with signing keys embedded when env vars are set', async () => {
      process.env.CLOUDFRONT_KEY_PAIR_ID = 'K456';
      process.env.CLOUDFRONT_PRIVATE_KEY = 'my-private-key';
      const { initializeCloudFront, getCloudFrontConfig } = await load();
      initializeCloudFront(makeConfig());
      const config = getCloudFrontConfig();
      expect(config?.keyPairId).toBe('K456');
      expect(config?.privateKey).toBe('my-private-key');
    });

    it('returns config with urlExpiry when provided', async () => {
      const { initializeCloudFront, getCloudFrontConfig } = await load();
      initializeCloudFront(makeConfig({ urlExpiry: 7200 }));
      expect(getCloudFrontConfig()?.urlExpiry).toBe(7200);
    });

    it('persists same config on second getCloudFrontConfig call', async () => {
      const { initializeCloudFront, getCloudFrontConfig } = await load();
      initializeCloudFront(makeConfig());
      expect(getCloudFrontConfig()).toBe(getCloudFrontConfig());
    });
  });
});
