import { ensureClerkStartupReady } from './startup';

describe('ensureClerkStartupReady', () => {
  it('does not call ensureClerkIndexes when Clerk is disabled', async () => {
    const ensureClerkIndexes = jest.fn().mockResolvedValue(undefined);
    const connection = {};

    await ensureClerkStartupReady({ enabled: false }, { ensureClerkIndexes, connection });

    expect(ensureClerkIndexes).not.toHaveBeenCalled();
  });

  it('awaits ensureClerkIndexes with the given connection when Clerk is enabled', async () => {
    const ensureClerkIndexes = jest.fn().mockResolvedValue(undefined);
    const connection = { marker: 'the-connection' };

    await ensureClerkStartupReady(
      {
        enabled: true,
        publishableKey: 'pk_test_abc',
        secretKey: 'sk_test_abc',
        jwtKey: 'jwt-key',
        authorizedParties: ['https://app.example.com'],
        webhookSigningSecret: 'whsec_abc',
      },
      { ensureClerkIndexes, connection },
    );

    expect(ensureClerkIndexes).toHaveBeenCalledTimes(1);
    expect(ensureClerkIndexes).toHaveBeenCalledWith(connection);
  });

  it('propagates a rejection from ensureClerkIndexes when Clerk is enabled', async () => {
    const failure = new Error('index assurance failed');
    const ensureClerkIndexes = jest.fn().mockRejectedValue(failure);
    const connection = {};

    await expect(
      ensureClerkStartupReady(
        {
          enabled: true,
          publishableKey: 'pk_test_abc',
          secretKey: 'sk_test_abc',
          jwtKey: 'jwt-key',
          authorizedParties: ['https://app.example.com'],
          webhookSigningSecret: 'whsec_abc',
        },
        { ensureClerkIndexes, connection },
      ),
    ).rejects.toThrow('index assurance failed');
  });
});
