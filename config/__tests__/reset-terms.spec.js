const resetTermsAcceptance = require('../reset-terms-operation');

describe('reset terms operation', () => {
  it('clears the shared auth-user cache only after the reset is published', async () => {
    const order = [];
    const updateMany = jest.fn(async () => {
      order.push('update');
      return { modifiedCount: 2 };
    });
    const mutateMCPAuthority = jest.fn(async (mutation) => {
      const result = await mutation();
      order.push('publish');
      return { generation: 2, result };
    });
    const clear = jest.fn(async () => {
      order.push('clear-cache');
    });

    const result = await resetTermsAcceptance({
      userModel: { updateMany },
      authority: { mutateMCPAuthority },
      authUserCache: { clear },
    });

    expect(result.modifiedCount).toBe(2);
    expect(updateMany).toHaveBeenCalledWith(
      {},
      { $set: { termsAccepted: false, termsAcceptedAt: null } },
    );
    expect(clear).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['update', 'publish', 'clear-cache']);
  });

  it('surfaces cache invalidation failure after the reset succeeds', async () => {
    const cacheError = new Error('cache unavailable');
    const authority = {
      mutateMCPAuthority: jest.fn(async (mutation) => ({
        generation: 2,
        result: await mutation(),
      })),
    };

    await expect(
      resetTermsAcceptance({
        userModel: { updateMany: jest.fn(async () => ({ modifiedCount: 1 })) },
        authority,
        authUserCache: { clear: jest.fn(async () => Promise.reject(cacheError)) },
      }),
    ).rejects.toBe(cacheError);
    expect(authority.mutateMCPAuthority).toHaveBeenCalledTimes(1);
  });
});
