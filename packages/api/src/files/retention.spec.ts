import { RetentionMode } from 'librechat-data-provider';
import {
  createMinimalRetentionRequest,
  getAgentFileRetentionExpiry,
  getConversationExpirationDate,
  getRetentionExpiry,
  getSharedLinkExpiration,
  isActiveExpirationDate,
  isBooleanOrStringTrue,
  type RetentionDependencies,
  type RetentionRequest,
} from './retention';

describe('retention helpers', () => {
  const expirationDate = new Date('2030-01-01T00:00:00.000Z');
  let dependencies: jest.Mocked<RetentionDependencies>;

  beforeEach(() => {
    dependencies = {
      getConvo: jest.fn(),
      createExpirationDate: jest.fn().mockReturnValue(expirationDate),
      logger: {
        error: jest.fn(),
      },
    };
  });

  const request = (overrides: RetentionRequest = {}): RetentionRequest => ({
    user: {
      id: 'user-1',
      tenantId: 'tenant-1',
      ...overrides.user,
    },
    body: {
      conversationId: 'convo-1',
      ...overrides.body,
    },
    config: {
      interfaceConfig: {
        ...overrides.config?.interfaceConfig,
      },
    },
  });

  it('returns expiry when retentionMode is ALL', async () => {
    const result = await getRetentionExpiry(
      request({ config: { interfaceConfig: { retentionMode: RetentionMode.ALL } } }),
      dependencies,
    );

    expect(result).toEqual({ expiredAt: expirationDate });
    expect(dependencies.getConvo).not.toHaveBeenCalled();
  });

  it('returns a fresh expiry when the conversation has an active expiration', async () => {
    dependencies.getConvo.mockResolvedValue({
      expiredAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const result = await getRetentionExpiry(request(), dependencies);

    expect(result).toEqual({ expiredAt: expirationDate });
  });

  it('returns the conversation expiration when the conversation is already expired', async () => {
    const expiredAt = new Date(Date.now() - 60 * 60 * 1000);
    dependencies.getConvo.mockResolvedValue({ expiredAt });

    const result = await getRetentionExpiry(request(), dependencies);

    expect(result).toEqual({ expiredAt });
    expect(dependencies.createExpirationDate).not.toHaveBeenCalled();
  });

  it('returns no retention fields when the conversation has no expiration', async () => {
    dependencies.getConvo.mockResolvedValue({ expiredAt: null });

    await expect(getRetentionExpiry(request(), dependencies)).resolves.toEqual({});
  });

  it('returns expiry when the conversation has no expiration but explicit temporary intent is present', async () => {
    dependencies.getConvo.mockResolvedValue({ expiredAt: null });

    const result = await getRetentionExpiry(
      request({ body: { conversationId: 'convo-1', isTemporary: true } }),
      dependencies,
    );

    expect(result).toEqual({ expiredAt: expirationDate });
  });

  it('returns no retention fields when conversation is missing and isTemporary is false', async () => {
    dependencies.getConvo.mockResolvedValue(null);

    const result = await getRetentionExpiry(
      request({ body: { conversationId: 'convo-1', isTemporary: false } }),
      dependencies,
    );

    expect(result).toEqual({});
  });

  it('returns expiry when isTemporary is true', async () => {
    dependencies.getConvo.mockResolvedValue(null);

    const result = await getRetentionExpiry(
      request({ body: { conversationId: 'convo-1', isTemporary: true } }),
      dependencies,
    );

    expect(result).toEqual({ expiredAt: expirationDate });
  });

  it('returns expiry when isTemporary is the string "true"', async () => {
    dependencies.getConvo.mockResolvedValue(null);

    const result = await getRetentionExpiry(
      request({ body: { conversationId: 'convo-1', isTemporary: 'true' } }),
      dependencies,
    );

    expect(result).toEqual({ expiredAt: expirationDate });
  });

  it('returns no retention fields when conversation lookup throws without explicit temporary intent', async () => {
    const error = new Error('database unavailable');
    dependencies.getConvo.mockRejectedValue(error);

    const result = await getRetentionExpiry(request(), dependencies);

    expect(result).toEqual({});
    expect(dependencies.logger?.error).toHaveBeenCalledWith(
      '[getRetentionExpiry] Error checking conversation retention:',
      error,
    );
  });

  it('applies retention when explicit temporary intent is present and conversation lookup throws', async () => {
    const error = new Error('database unavailable');
    dependencies.getConvo.mockRejectedValue(error);

    const result = await getRetentionExpiry(
      request({ body: { conversationId: 'convo-1', isTemporary: true } }),
      dependencies,
    );

    expect(result).toEqual({ expiredAt: expirationDate });
    expect(dependencies.logger?.error).toHaveBeenCalledWith(
      '[getRetentionExpiry] Error checking conversation retention:',
      error,
    );
  });

  it('returns a fallback expiration when expiration creation throws', async () => {
    const error = new Error('bad config');
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-01-01T00:00:00.000Z').getTime());
    dependencies.createExpirationDate.mockImplementation(() => {
      throw error;
    });

    const result = await getRetentionExpiry(
      request({ body: { conversationId: undefined, isTemporary: true } }),
      dependencies,
    );

    expect(result).toEqual({ expiredAt: new Date('2026-01-31T00:00:00.000Z') });
    expect(dependencies.logger?.error).toHaveBeenCalledWith(
      '[getRetentionExpiry] Error creating file expiration date:',
      error,
    );
    nowSpy.mockRestore();
  });

  it('memoizes retention lookup per request object', async () => {
    dependencies.getConvo.mockResolvedValue({
      expiredAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const req = request();

    const first = await getRetentionExpiry(req, dependencies);
    const second = await getRetentionExpiry(req, dependencies);

    expect(first).toEqual({ expiredAt: expirationDate });
    expect(second).toEqual({ expiredAt: expirationDate });
    expect(dependencies.getConvo).toHaveBeenCalledTimes(1);
  });

  it('returns no retention fields when req is null or undefined', async () => {
    await expect(getRetentionExpiry(null, dependencies)).resolves.toEqual({});
    await expect(getRetentionExpiry(undefined, dependencies)).resolves.toEqual({});
  });

  it('skips persistent agent files in temporary retention mode when retainAgentFiles is disabled', async () => {
    const result = await getAgentFileRetentionExpiry(
      {
        req: request({
          config: {
            interfaceConfig: {
              retentionMode: RetentionMode.TEMPORARY,
              retainAgentFiles: false,
            },
          },
        }),
        messageAttachment: false,
        toolResource: 'context',
      },
      dependencies,
    );

    expect(result).toEqual({});
    expect(dependencies.getConvo).not.toHaveBeenCalled();
    expect(dependencies.createExpirationDate).not.toHaveBeenCalled();
  });

  it('skips persistent agent files in temporary retention mode when retainAgentFiles is enabled', async () => {
    const result = await getAgentFileRetentionExpiry(
      {
        req: request({
          config: {
            interfaceConfig: {
              retentionMode: RetentionMode.TEMPORARY,
              retainAgentFiles: true,
            },
          },
        }),
        messageAttachment: false,
        toolResource: 'context',
      },
      dependencies,
    );

    expect(result).toEqual({});
    expect(dependencies.getConvo).not.toHaveBeenCalled();
    expect(dependencies.createExpirationDate).not.toHaveBeenCalled();
  });

  it('applies all-data retention to persistent agent files when retainAgentFiles is disabled', async () => {
    const result = await getAgentFileRetentionExpiry(
      {
        req: request({
          config: {
            interfaceConfig: {
              retentionMode: RetentionMode.ALL,
              retainAgentFiles: false,
            },
          },
        }),
        messageAttachment: false,
        toolResource: 'context',
      },
      dependencies,
    );

    expect(result).toEqual({ expiredAt: expirationDate });
    expect(dependencies.getConvo).not.toHaveBeenCalled();
    expect(dependencies.createExpirationDate).toHaveBeenCalledTimes(1);
  });

  it('keeps current all-data retention behavior when retainAgentFiles is unset', async () => {
    const result = await getAgentFileRetentionExpiry(
      {
        req: request({ config: { interfaceConfig: { retentionMode: RetentionMode.ALL } } }),
        messageAttachment: false,
        toolResource: 'context',
      },
      dependencies,
    );

    expect(result).toEqual({ expiredAt: expirationDate });
    expect(dependencies.createExpirationDate).toHaveBeenCalledTimes(1);
  });

  it('skips all-data retention for persistent agent files when retainAgentFiles is enabled', async () => {
    const result = await getAgentFileRetentionExpiry(
      {
        req: request({
          config: {
            interfaceConfig: {
              retentionMode: RetentionMode.ALL,
              retainAgentFiles: true,
            },
          },
        }),
        messageAttachment: false,
        toolResource: 'context',
      },
      dependencies,
    );

    expect(result).toEqual({});
    expect(dependencies.getConvo).not.toHaveBeenCalled();
    expect(dependencies.createExpirationDate).not.toHaveBeenCalled();
  });

  it('still applies all-data retention to agent message attachments when retainAgentFiles is enabled', async () => {
    const result = await getAgentFileRetentionExpiry(
      {
        req: request({
          config: {
            interfaceConfig: {
              retentionMode: RetentionMode.ALL,
              retainAgentFiles: true,
            },
          },
        }),
        messageAttachment: true,
        toolResource: 'context',
      },
      dependencies,
    );

    expect(result).toEqual({ expiredAt: expirationDate });
    expect(dependencies.createExpirationDate).toHaveBeenCalledTimes(1);
  });

  it('parses valid conversation expiration dates and ignores invalid ones', () => {
    expect(getConversationExpirationDate({ expiredAt: expirationDate })).toBe(expirationDate);
    expect(getConversationExpirationDate({ expiredAt: expirationDate.toISOString() })).toEqual(
      expirationDate,
    );
    expect(getConversationExpirationDate({ expiredAt: 'not-a-date' })).toBeNull();
    expect(getConversationExpirationDate({ expiredAt: null })).toBeNull();
  });

  it('compares active expiration dates against the provided clock', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    expect(isActiveExpirationDate(new Date('2026-01-01T00:00:01.000Z'), now)).toBe(true);
    expect(isActiveExpirationDate(new Date('2025-12-31T23:59:59.000Z'), now)).toBe(false);
  });

  it('uses strict temporary truthiness semantics', () => {
    expect(isBooleanOrStringTrue(true)).toBe(true);
    expect(isBooleanOrStringTrue('true')).toBe(true);
    expect(isBooleanOrStringTrue(1)).toBe(false);
    expect(isBooleanOrStringTrue('1')).toBe(false);
  });

  it('creates minimal retention requests for tool calls', () => {
    expect(
      createMinimalRetentionRequest({
        user: { id: 'user-1', tenantId: 'tenant-1' },
        body: { conversationId: 'convo-1', isTemporary: 'true' },
        config: { interfaceConfig: { retentionMode: RetentionMode.TEMPORARY } },
      }),
    ).toEqual({
      user: { id: 'user-1', tenantId: 'tenant-1' },
      body: { conversationId: 'convo-1', isTemporary: 'true' },
      config: { interfaceConfig: { retentionMode: RetentionMode.TEMPORARY } },
    });

    expect(createMinimalRetentionRequest()).toBeUndefined();
  });

  describe('getSharedLinkExpiration', () => {
    it('returns undefined when the conversation id is missing', async () => {
      await expect(
        getSharedLinkExpiration({ req: request() }, dependencies),
      ).resolves.toBeUndefined();
      expect(dependencies.getConvo).not.toHaveBeenCalled();
    });

    it('returns null for non-retained conversations in temporary retention mode', async () => {
      dependencies.getConvo.mockResolvedValue({ expiredAt: null });

      await expect(
        getSharedLinkExpiration({ req: request(), conversationId: 'convo-1' }, dependencies),
      ).resolves.toBeNull();
    });

    it('returns a fresh expiry for retentionMode ALL conversations without an expiration', async () => {
      dependencies.getConvo.mockResolvedValue({ expiredAt: null });

      await expect(
        getSharedLinkExpiration(
          {
            req: request({ config: { interfaceConfig: { retentionMode: RetentionMode.ALL } } }),
            conversationId: 'convo-1',
          },
          dependencies,
        ),
      ).resolves.toBe(expirationDate);
    });

    it('returns an expired source conversation date so callers can reject the share', async () => {
      const expiredAt = new Date(Date.now() - 60 * 60 * 1000);
      dependencies.getConvo.mockResolvedValue({ expiredAt });

      await expect(
        getSharedLinkExpiration({ req: request(), conversationId: 'convo-1' }, dependencies),
      ).resolves.toBe(expiredAt);
      expect(dependencies.createExpirationDate).not.toHaveBeenCalled();
    });
  });
});
