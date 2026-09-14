/** @jest-environment ./test/indexedDb.environment.cjs */
import { IDBFactory } from 'fake-indexeddb';
import type { TSyncArtifactAppRequest } from 'librechat-data-provider';
import {
  clearArtifactSyncQueueForTests,
  completeArtifactSync,
  enqueueArtifactSync,
  listArtifactSyncQueue,
  rescheduleArtifactSync,
  getArtifactSyncQueueId,
} from './queue';

const request: TSyncArtifactAppRequest = {
  title: 'Chart',
  artifact: { type: 'react', content: '<div />' },
  source: { conversationId: 'conversation-1', sourceKey: 'identifier:chart' },
};

describe('artifact sync queue', () => {
  beforeEach(async () => {
    Object.defineProperty(window, 'indexedDB', {
      value: new IDBFactory(),
      configurable: true,
    });
    await clearArtifactSyncQueueForTests();
  });

  async function reloadQueue() {
    let restored!: typeof import('./queue');
    jest.isolateModules(() => {
      restored = jest.requireActual<typeof import('./queue')>('./queue');
    });
    return restored.listArtifactSyncQueue('user-1');
  }

  function pauseNextDatabaseOpen() {
    let resume: () => void = () => undefined;
    let paused: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      paused = resolve;
    });
    const open = window.indexedDB.open.bind(window.indexedDB);
    jest.spyOn(window.indexedDB, 'open').mockImplementationOnce((...args) => {
      const pending = open(...args);
      pending.addEventListener(
        'success',
        (event) => {
          event.stopImmediatePropagation();
          resume = () => {
            pending.onsuccess?.call(pending, event);
          };
          paused();
        },
        { once: true },
      );
      return pending;
    });
    return { ready, resume: () => resume() };
  }

  it('retains registration work independently of the producing component', async () => {
    await enqueueArtifactSync('user-1', request, 'signature-1', 500);

    expect(await listArtifactSyncQueue('user-1')).toEqual([
      expect.objectContaining({
        ownerId: 'user-1',
        request,
        signature: 'signature-1',
        failures: 0,
      }),
    ]);
    expect(await listArtifactSyncQueue('user-2')).toEqual([]);
  });

  it('does not let completion of an old request remove a newer snapshot', async () => {
    await enqueueArtifactSync('user-1', request, 'signature-1', 0);
    await enqueueArtifactSync(
      'user-1',
      { ...request, artifact: { ...request.artifact, content: '<div>new</div>' } },
      'signature-2',
      0,
    );

    const [{ id }] = await listArtifactSyncQueue('user-1');
    await completeArtifactSync(id, 'signature-1');

    expect(await listArtifactSyncQueue('user-1')).toEqual([
      expect.objectContaining({ signature: 'signature-2' }),
    ]);
  });

  it('records retry state without changing the queued request identity', async () => {
    await enqueueArtifactSync('user-1', request, 'signature-1', 0);
    const [{ id }] = await listArtifactSyncQueue('user-1');
    await rescheduleArtifactSync(id, 'signature-1', 1000);

    expect(await listArtifactSyncQueue('user-1')).toEqual([
      expect.objectContaining({ id, failures: 1, signature: 'signature-1' }),
    ]);
  });

  it('does not persist an enqueue that completed while IndexedDB was opening', async () => {
    await listArtifactSyncQueue('user-1');
    const paused = pauseNextDatabaseOpen();
    const enqueued = enqueueArtifactSync('user-1', request, 'signature-1', 0);
    await paused.ready;
    const completed = completeArtifactSync(
      getArtifactSyncQueueId('user-1', request),
      'signature-1',
    );
    await listArtifactSyncQueue('user-1');
    expect(window.indexedDB.open).toHaveBeenCalledTimes(1);
    paused.resume();
    await Promise.all([enqueued, completed]);

    expect(await reloadQueue()).toEqual([]);
  });

  it('does not overwrite a newer durable snapshot with a late enqueue', async () => {
    await listArtifactSyncQueue('user-1');
    const paused = pauseNextDatabaseOpen();
    const enqueued = enqueueArtifactSync('user-1', request, 'signature-1', 0);
    await paused.ready;
    const superseded = enqueueArtifactSync('user-1', request, 'signature-2', 0);
    await listArtifactSyncQueue('user-1');
    expect(window.indexedDB.open).toHaveBeenCalledTimes(1);
    paused.resume();
    await Promise.all([enqueued, superseded]);

    expect(await reloadQueue()).toEqual([expect.objectContaining({ signature: 'signature-2' })]);
  });

  it('does not restore a completed snapshot from a late retry write', async () => {
    await enqueueArtifactSync('user-1', request, 'signature-1', 0);
    const id = getArtifactSyncQueueId('user-1', request);
    const paused = pauseNextDatabaseOpen();
    const rescheduled = rescheduleArtifactSync(id, 'signature-1', 1000);
    await paused.ready;
    const completed = completeArtifactSync(id, 'signature-1');
    await listArtifactSyncQueue('user-1');
    expect(window.indexedDB.open).toHaveBeenCalledTimes(1);
    paused.resume();
    await Promise.all([rescheduled, completed]);

    expect(await reloadQueue()).toEqual([]);
  });

  it('removes an older durable snapshot when a newer enqueue completes before its write', async () => {
    await enqueueArtifactSync('user-1', request, 'signature-1', 0);
    const paused = pauseNextDatabaseOpen();
    const enqueued = enqueueArtifactSync('user-1', request, 'signature-2', 0);
    await paused.ready;
    const completed = completeArtifactSync(
      getArtifactSyncQueueId('user-1', request),
      'signature-2',
    );
    await listArtifactSyncQueue('user-1');
    expect(window.indexedDB.open).toHaveBeenCalledTimes(1);
    paused.resume();
    await Promise.all([enqueued, completed]);

    expect(await reloadQueue()).toEqual([]);
  });

  it('persists the newer snapshot and retry state when retry overtakes its enqueue write', async () => {
    await enqueueArtifactSync('user-1', request, 'signature-1', 0);
    const paused = pauseNextDatabaseOpen();
    const enqueued = enqueueArtifactSync('user-1', request, 'signature-2', 0);
    await paused.ready;
    const rescheduled = rescheduleArtifactSync(
      getArtifactSyncQueueId('user-1', request),
      'signature-2',
      1000,
    );
    await listArtifactSyncQueue('user-1');
    expect(window.indexedDB.open).toHaveBeenCalledTimes(1);
    paused.resume();
    await Promise.all([enqueued, rescheduled]);

    expect(await reloadQueue()).toEqual([
      expect.objectContaining({ signature: 'signature-2', failures: 1 }),
    ]);
  });
});
