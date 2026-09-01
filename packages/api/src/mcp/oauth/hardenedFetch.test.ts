import { createSSRFSafeUndiciConnect, isOAuthUrlAllowed } from '~/auth';
import { createHardenedOAuthFetch, resetHardenedOAuthFetchDispatchers } from './hardenedFetch';

jest.mock('~/auth', () => ({
  createSSRFSafeUndiciConnect: jest.fn(() => ({ lookup: jest.fn() })),
  isOAuthUrlAllowed: jest.fn(() => false),
}));

const mockCreateSSRFSafeUndiciConnect = createSSRFSafeUndiciConnect as jest.MockedFunction<
  typeof createSSRFSafeUndiciConnect
>;
const mockIsOAuthUrlAllowed = isOAuthUrlAllowed as jest.MockedFunction<typeof isOAuthUrlAllowed>;

describe('createHardenedOAuthFetch', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue({ ok: true } as Response);
    mockIsOAuthUrlAllowed.mockReturnValue(false);
  });

  afterEach(() => {
    resetHardenedOAuthFetchDispatchers();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('attaches an SSRF-safe dispatcher at connect time', async () => {
    await createHardenedOAuthFetch()('https://auth.example.com:9443/token', {
      method: 'POST',
    });

    expect(mockCreateSSRFSafeUndiciConnect).toHaveBeenCalledWith(undefined, '9443');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://auth.example.com:9443/token',
      expect.objectContaining({
        method: 'POST',
        dispatcher: expect.any(Object),
      }),
    );
  });

  it('does not apply allowedAddresses when allowedDomains is active but unmatched', async () => {
    await createHardenedOAuthFetch({
      allowedDomains: ['https://trusted.example.com'],
      allowedAddresses: ['10.0.0.5:9444'],
    })('https://untrusted.example.com:9444/token');

    expect(mockCreateSSRFSafeUndiciConnect).toHaveBeenCalledWith(null, '9444');
    expect(mockFetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({ dispatcher: expect.any(Object) }),
    );
  });

  it('preserves admin-trusted allowedDomains bypass behavior', async () => {
    mockIsOAuthUrlAllowed.mockReturnValueOnce(true);

    await createHardenedOAuthFetch({
      allowedDomains: ['https://auth.example.com'],
    })('https://auth.example.com/token', { method: 'GET' });

    expect(mockCreateSSRFSafeUndiciConnect).not.toHaveBeenCalled();
    expect(mockFetch.mock.calls[0][1]).not.toHaveProperty('dispatcher');
  });

  it('normalizes allowedAddresses before caching dispatchers', async () => {
    await createHardenedOAuthFetch({
      allowedAddresses: ['10.0.0.5:9443', '192.168.1.5:9443'],
    })('https://auth.example.com:9443/token');

    await createHardenedOAuthFetch({
      allowedAddresses: ['192.168.1.5:9443', '10.0.0.5:9443'],
    })('https://auth.example.com:9443/token');

    expect(mockCreateSSRFSafeUndiciConnect).toHaveBeenCalledTimes(1);
  });
});
