const migrateTermsTimestamps = require('../migrate-terms-timestamp-operation');

describe('migrate terms timestamp operation', () => {
  it('publishes all matching updates before clearing the auth-user cache', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const order = [];
    const updateOne = jest.fn(async () => {
      order.push('update');
      return { modifiedCount: 1 };
    });
    const mutateMCPAuthority = jest.fn(async (mutation) => {
      const result = await mutation();
      order.push('publish');
      return { generation: 2, result };
    });
    const clear = jest.fn(async () => {
      order.push('clear-cache');
    });

    const result = await migrateTermsTimestamps({
      users: [{ _id: 'user-1', createdAt }],
      userModel: { updateOne },
      authority: { mutateMCPAuthority },
      authUserCache: { clear },
      now: () => new Date('2026-02-01T00:00:00.000Z'),
    });

    expect(result).toEqual({ migratedCount: 1, skippedCount: 0, errors: [] });
    expect(updateOne).toHaveBeenCalledWith(
      {
        _id: 'user-1',
        termsAccepted: true,
        $or: [{ termsAcceptedAt: null }, { termsAcceptedAt: { $exists: false } }],
      },
      { $set: { termsAcceptedAt: createdAt } },
    );
    expect(order).toEqual(['update', 'publish', 'clear-cache']);
  });

  it('publishes partial progress and clears the cache before reporting row errors', async () => {
    const rowError = new Error('write failed');
    const order = [];
    const updateOne = jest
      .fn()
      .mockRejectedValueOnce(rowError)
      .mockImplementationOnce(async () => {
        order.push('update');
        return { modifiedCount: 1 };
      });
    const mutateMCPAuthority = jest.fn(async (mutation) => {
      const result = await mutation();
      order.push('publish');
      return { generation: 2, result };
    });
    const clear = jest.fn(async () => {
      order.push('clear-cache');
    });

    const result = await migrateTermsTimestamps({
      users: [
        { _id: 'user-1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { _id: 'user-2', createdAt: new Date('2026-01-02T00:00:00.000Z') },
      ],
      userModel: { updateOne },
      authority: { mutateMCPAuthority },
      authUserCache: { clear },
      now: () => new Date('2026-02-01T00:00:00.000Z'),
    });

    expect(result).toEqual({
      migratedCount: 1,
      skippedCount: 0,
      errors: [{ userId: 'user-1', error: rowError }],
    });
    expect(order).toEqual(['update', 'publish', 'clear-cache']);
  });

  it('keeps the authority fence dirty when the migration itself aborts', async () => {
    const cursorError = new Error('cursor failed');
    const users = {
      [Symbol.asyncIterator]() {
        return { next: async () => await Promise.reject(cursorError) };
      },
    };
    const mutateMCPAuthority = jest.fn(async (mutation) => await mutation());
    const clear = jest.fn();

    await expect(
      migrateTermsTimestamps({
        users,
        userModel: { updateOne: jest.fn() },
        authority: { mutateMCPAuthority },
        authUserCache: { clear },
        now: () => new Date('2026-02-01T00:00:00.000Z'),
      }),
    ).rejects.toBe(cursorError);
    expect(clear).not.toHaveBeenCalled();
  });
});
