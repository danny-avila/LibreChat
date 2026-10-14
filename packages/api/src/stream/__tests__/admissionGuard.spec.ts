import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { GenerationAdmissionDeniedError } from '~/stream/interfaces/IJobStore';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';
import { stopUserGenerations } from '~/user/generations';

describe('GenerationJobManager admission guard', () => {
  let manager: GenerationJobManagerClass;
  let store: InMemoryJobStore;

  beforeEach(() => {
    store = new InMemoryJobStore({ ttlAfterComplete: 60000 });
    manager = new GenerationJobManagerClass();
    manager.configure({ jobStore: store, eventTransport: new InMemoryEventTransport() });
    manager.initialize();
  });

  afterEach(async () => {
    await manager.destroy();
  });

  it('refuses a job admitted while the account deletion has begun, leaving nothing running', async () => {
    manager.setAdmissionGuard(async () => false);

    await expect(manager.createJob('denied', 'user-1', 'denied')).rejects.toBeInstanceOf(
      GenerationAdmissionDeniedError,
    );
    await expect(manager.createJob('denied-2', 'user-1', 'denied-2')).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_IN_PROGRESS',
    });
    expect(await store.getJob('denied')).toBeNull();
  });

  it('skips the guard for callers that run their own admission check', async () => {
    const guard = jest.fn(async () => false);
    manager.setAdmissionGuard(guard);

    await expect(
      manager.createJob('own-check', 'user-1', 'own-check', { skipAdmissionGuard: true }),
    ).resolves.toMatchObject({ streamId: 'own-check' });
    expect(guard).not.toHaveBeenCalled();
  });

  it('retires the committed job and propagates the failure when the guard rejects', async () => {
    manager.setAdmissionGuard(async () => {
      throw new Error('lookup down');
    });

    await expect(manager.createJob('failed', 'user-1', 'failed')).rejects.toThrow('lookup down');
    expect(await store.getJob('failed')).toBeNull();
  });

  it('admits jobs while the account is active', async () => {
    manager.setAdmissionGuard(async () => true);

    await expect(manager.createJob('ok', 'user-1', 'ok')).resolves.toMatchObject({
      streamId: 'ok',
    });
  });

  it('stops a job admitted before the deletion fence through the drain', async () => {
    let active = true;
    manager.setAdmissionGuard(async () => active);
    await manager.createJob('before', 'user-1', 'before');

    active = false;
    await stopUserGenerations('user-1', undefined, manager);

    expect((await store.getJob('before'))?.status).not.toBe('running');
    await expect(manager.createJob('after', 'user-1', 'after')).rejects.toBeInstanceOf(
      GenerationAdmissionDeniedError,
    );
  });
});
