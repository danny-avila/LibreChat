import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createOpenIDRefreshFlightMethods } from './openidRefreshFlight';
import openidRefreshFlightSchema from '~/schema/openidRefreshFlight';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createOpenIDRefreshFlightMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  if (!mongoose.models.OpenIDRefreshFlight) {
    mongoose.model<t.IOpenIDRefreshFlight>('OpenIDRefreshFlight', openidRefreshFlightSchema);
  }
  methods = createOpenIDRefreshFlightMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('OpenIDRefreshFlight Methods', () => {
  it('acquires a new pending flight and returns existing flight to joiners', async () => {
    const first = await methods.acquireOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-1',
      lockExpiresAt: new Date(Date.now() + 30000),
      expiresAt: new Date(Date.now() + 60000),
    });

    const second = await methods.acquireOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-2',
      lockExpiresAt: new Date(Date.now() + 30000),
      expiresAt: new Date(Date.now() + 60000),
    });

    expect(first.acquired).toBe(true);
    expect(first.flight?.ownerId).toBe('owner-1');
    expect(second.acquired).toBe(false);
    expect(second.flight?.ownerId).toBe('owner-1');
    expect(second.flight?.status).toBe('pending');
  });

  it('reclaims an expired pending lock', async () => {
    await methods.acquireOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-1',
      lockExpiresAt: new Date(Date.now() - 1000),
      expiresAt: new Date(Date.now() + 60000),
    });

    const reclaimed = await methods.acquireOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-2',
      lockExpiresAt: new Date(Date.now() + 30000),
      expiresAt: new Date(Date.now() + 60000),
    });

    expect(reclaimed.acquired).toBe(true);
    expect(reclaimed.flight?.ownerId).toBe('owner-2');
  });

  it('completes a flight only for the owning pending worker', async () => {
    await methods.acquireOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-1',
      lockExpiresAt: new Date(Date.now() + 30000),
      expiresAt: new Date(Date.now() + 60000),
    });

    await expect(
      methods.completeOpenIDRefreshFlight({
        key: 'flight-key',
        ownerId: 'owner-2',
        encryptedResult: 'encrypted-wrong',
        expiresAt: new Date(Date.now() + 60000),
      }),
    ).resolves.toBeNull();

    const completed = await methods.completeOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-1',
      encryptedResult: 'encrypted-result',
      expiresAt: new Date(Date.now() + 60000),
    });

    expect(completed?.status).toBe('completed');
    expect(completed?.encryptedResult).toBe('encrypted-result');
  });

  it('finds completed unexpired flights and ignores expired ones', async () => {
    await methods.acquireOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-1',
      lockExpiresAt: new Date(Date.now() + 30000),
      expiresAt: new Date(Date.now() + 60000),
    });
    await methods.completeOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-1',
      encryptedResult: 'encrypted-result',
      expiresAt: new Date(Date.now() + 60000),
    });

    await expect(methods.findOpenIDRefreshFlight({ key: 'flight-key' })).resolves.toMatchObject({
      status: 'completed',
      encryptedResult: 'encrypted-result',
    });

    const OpenIDRefreshFlight = mongoose.models.OpenIDRefreshFlight;
    await OpenIDRefreshFlight.updateOne(
      { key: 'flight-key' },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    await expect(methods.findOpenIDRefreshFlight({ key: 'flight-key' })).resolves.toBeNull();
  });
});
