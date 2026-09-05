import type { OpenIDRefreshRecoveryDeps } from './recovery';
import { createOpenIDRefreshRecoveryService } from './recovery';

describe('OpenID authentication publication settlement', () => {
  function setup() {
    const deps = {
      logger: { debug: jest.fn(), warn: jest.fn() },
      createRefreshTokenBridgeFlightKey: jest.fn(() => 'publication'),
      acquireOpenIDRefreshFlight: jest.fn().mockResolvedValue({
        acquired: true,
        ownerId: 'owner',
      }),
      withOpenIDRefreshFlightLease: jest.fn(({ operation }) =>
        operation({
          assertLeaseOwned: jest.fn().mockResolvedValue(true),
          markLeaseSettled: jest.fn(),
        }),
      ),
      failOpenIDRefreshFlight: jest.fn().mockResolvedValue(null),
      completeOpenIDRefreshFlight: jest.fn().mockResolvedValue({ status: 'completed' }),
      getOpenIDAppAuthToken: jest.fn(() => 'app-token'),
      storeOpenIDSession: jest.fn().mockResolvedValue(undefined),
      assertOpenIDRefreshFlightAvailable: jest.fn().mockResolvedValue(true),
      setOpenIDAuthTokens: jest.fn(() => 'app-token'),
    };
    const service = createOpenIDRefreshRecoveryService(
      deps as unknown as OpenIDRefreshRecoveryDeps,
    );
    const input = {
      tokenset: { access_token: 'access', id_token: 'id', refresh_token: 'refresh' },
      user: { _id: 'user' },
      existingRefreshToken: 'refresh',
      req: {},
      res: {},
    };
    return { deps, service, input };
  }

  it('settles a missing-session failure immediately and preserves the original error', async () => {
    const { deps, service, input } = setup();
    const error = new Error('failed to load session');
    const req = { session: { reload: (callback: (error: Error) => void) => callback(error) } };
    await expect(service.sendOpenIDAuthResponse({ ...input, req })).rejects.toBe(error);
    expect(deps.failOpenIDRefreshFlight).toHaveBeenCalledWith({
      key: 'publication',
      ownerId: 'owner',
      error,
    });
    expect(deps.completeOpenIDRefreshFlight).not.toHaveBeenCalled();
  });

  it('preserves the request error when failure settlement also fails', async () => {
    const { deps, service, input } = setup();
    const error = new Error('session unavailable');
    deps.getOpenIDAppAuthToken.mockImplementation(() => {
      throw error;
    });
    deps.failOpenIDRefreshFlight.mockRejectedValue(new Error('store unavailable'));
    await expect(service.sendOpenIDAuthResponse(input)).rejects.toBe(error);
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it('does not fail an indeterminate completion write', async () => {
    const { deps, service, input } = setup();
    const error = new Error('completion acknowledgement lost');
    deps.completeOpenIDRefreshFlight.mockRejectedValue(error);
    await expect(service.sendOpenIDAuthResponse(input)).rejects.toBe(error);
    expect(deps.failOpenIDRefreshFlight).not.toHaveBeenCalled();
  });

  it('leaves successful publication completed', async () => {
    const { deps, service, input } = setup();
    await expect(service.sendOpenIDAuthResponse(input)).resolves.toBe('app-token');
    expect(deps.completeOpenIDRefreshFlight).toHaveBeenCalledTimes(1);
    expect(deps.failOpenIDRefreshFlight).not.toHaveBeenCalled();
  });
});
