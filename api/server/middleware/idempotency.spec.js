const mockHasGenerationClaim = jest.fn();
const mockWarn = jest.fn();

jest.mock('@librechat/api', () => ({
  GenerationJobManager: {
    hasGenerationClaim: (...args) => mockHasGenerationClaim(...args),
  },
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: (...args) => mockWarn(...args) },
}));

const {
  detectGenerationRetry,
  isConfirmedGenerationRetry,
} = require('~/server/middleware/idempotency');

function request(overrides = {}) {
  return {
    method: 'POST',
    path: '/',
    body: { clientRequestId: 'request-1' },
    user: { id: 'user-1' },
    ...overrides,
  };
}

describe('generation retry detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks only a submission with an existing durable claim as a retry', async () => {
    mockHasGenerationClaim.mockResolvedValue(true);
    const req = request();
    const next = jest.fn();

    await detectGenerationRetry(req, {}, next);

    expect(mockHasGenerationClaim).toHaveBeenCalledWith('user-1', 'request-1');
    expect(isConfirmedGenerationRetry(req)).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('leaves a new submission subject to the message limiters', async () => {
    mockHasGenerationClaim.mockResolvedValue(false);
    const req = request();

    await detectGenerationRetry(req, {}, jest.fn());

    expect(isConfirmedGenerationRetry(req)).toBe(false);
  });

  it.each([
    ['a resume', { path: '/resume' }],
    ['a request without an authenticated user', { user: undefined }],
    ['an invalid idempotency key', { body: { clientRequestId: 'invalid key' } }],
  ])('does not probe %s', async (_label, overrides) => {
    const req = request(overrides);
    const next = jest.fn();

    await detectGenerationRetry(req, {}, next);

    expect(mockHasGenerationClaim).not.toHaveBeenCalled();
    expect(isConfirmedGenerationRetry(req)).toBe(false);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('keeps the limiter active when the read-only probe is unavailable', async () => {
    mockHasGenerationClaim.mockRejectedValue(new Error('store unavailable'));
    const req = request();
    const next = jest.fn();

    await detectGenerationRetry(req, {}, next);

    expect(isConfirmedGenerationRetry(req)).toBe(false);
    expect(mockWarn).toHaveBeenCalledWith(
      '[GenerationIdempotency] Failed to inspect start-generation claim',
      expect.objectContaining({
        userId: 'user-1',
        clientRequestId: 'request-1',
      }),
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
