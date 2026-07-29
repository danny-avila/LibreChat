import Keyv from 'keyv';

import { ImportJobStore } from './job';

describe('ImportJobStore', () => {
  let store: ImportJobStore;

  beforeEach(() => {
    store = new ImportJobStore(new Keyv(), 60000);
  });

  it('creates a job awaiting confirmation', async () => {
    const job = await store.create({
      userId: 'u1',
      filepath: '/tmp/a.zip',
      filename: 'a.zip',
    });

    expect(job.phase).toBe('queued');
    expect(job.status).toBe('active');
    expect(job.jobId).toHaveLength(36);
    expect(job.progress).toEqual({
      conversations: { done: 0, total: 0 },
      messages: { done: 0, total: 0 },
      assets: { done: 0, total: 0 },
    });
  });

  it('reads back a job for its owner only', async () => {
    const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });

    expect(await store.get('u1', job.jobId)).not.toBeNull();
    expect(await store.get('u2', job.jobId)).toBeNull();
  });

  it('merges patches and bumps updatedAt', async () => {
    const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });

    const patched = await store.patch('u1', job.jobId, {
      phase: 'conversations',
      progress: {
        conversations: { done: 5, total: 10 },
        messages: { done: 40, total: 80 },
        assets: { done: 0, total: 3 },
      },
    });

    expect(patched?.phase).toBe('conversations');
    expect(patched?.progress.conversations.done).toBe(5);
    expect(patched?.filename).toBe('a.zip');
    expect(patched?.updatedAt).toBeGreaterThanOrEqual(job.updatedAt);
  });

  it('marks a job cancelled and reports it', async () => {
    const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });

    expect(await store.isCancelled('u1', job.jobId)).toBe(false);
    expect(await store.cancel('u1', job.jobId)).toBe(true);
    expect(await store.isCancelled('u1', job.jobId)).toBe(true);
    expect((await store.get('u1', job.jobId))?.status).toBe('cancelled');
  });

  it('does not cancel another user’s job', async () => {
    const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });
    expect(await store.cancel('u2', job.jobId)).toBe(false);
    expect((await store.get('u1', job.jobId))?.status).toBe('active');
  });

  it('returns null when patching a job that does not exist', async () => {
    expect(await store.patch('u1', 'missing', { phase: 'failed' })).toBeNull();
  });

  it('keeps identity fields matching the storage key after a patch', async () => {
    const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });

    const patched = await store.patch('u1', job.jobId, { phase: 'assets' });

    expect(patched?.userId).toBe('u1');
    expect(patched?.jobId).toBe(job.jobId);
  });

  it('does not report another user’s job as cancelled', async () => {
    const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });
    await store.cancel('u1', job.jobId);

    expect(await store.isCancelled('u2', job.jobId)).toBe(false);
  });

  it('does not patch another user’s job and leaves the owner’s record untouched', async () => {
    const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });

    const result = await store.patch('u2', job.jobId, { phase: 'assets', status: 'failed' });

    expect(result).toBeNull();
    const owned = await store.get('u1', job.jobId);
    expect(owned?.phase).toBe(job.phase);
    expect(owned?.status).toBe(job.status);
    expect(owned?.updatedAt).toBe(job.updatedAt);
  });

  describe('terminal jobs', () => {
    it('ignores a phase update that lands after cancellation', async () => {
      const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });
      await store.cancel('u1', job.jobId);

      const patched = await store.patch('u1', job.jobId, { phase: 'conversations' });

      expect(patched?.phase).toBe('cancelled');
      expect(patched?.status).toBe('cancelled');
      expect(await store.isCancelled('u1', job.jobId)).toBe(true);
    });

    it('still records the partial report a cancelled run produced', async () => {
      const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });
      await store.cancel('u1', job.jobId);

      const report = {
        imported: 12,
        skipped: 0,
        assetsImported: 3,
        assetsUnavailable: 0,
        errors: [],
      };
      const patched = await store.patch('u1', job.jobId, { report });

      expect(patched?.report).toEqual(report);
      expect(patched?.phase).toBe('cancelled');
    });

    /** The background run reads the cancel flag and writes progress in two
     * separate round trips. Without serialization the progress write lands on a
     * job it read before the cancellation, resurrecting `status: 'active'` —
     * and the very next `isCancelled` then tells the run to keep importing. */
    it('does not let a progress update in flight during a cancellation resurrect the job', async () => {
      const backing = new Keyv();
      const read = backing.get.bind(backing);
      /** Only the first read stalls, which is the progress update's: the
       * cancellation then reads and writes entirely inside that window, so the
       * progress write is left holding a job snapshot taken before it. */
      let stall = true;
      jest.spyOn(backing, 'get').mockImplementation((async (key: string) => {
        const value = await read(key);
        if (stall) {
          stall = false;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return value;
      }) as typeof backing.get);
      const slowStore = new ImportJobStore(backing, 60000);
      const job = await slowStore.create({
        userId: 'u1',
        filepath: '/tmp/a.zip',
        filename: 'a.zip',
      });

      const progress = slowStore.patch('u1', job.jobId, {
        progress: {
          conversations: { done: 5, total: 10 },
          messages: { done: 40, total: 80 },
          assets: { done: 0, total: 0 },
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 1));
      await slowStore.cancel('u1', job.jobId);
      await progress;

      expect(await slowStore.isCancelled('u1', job.jobId)).toBe(true);
    });
  });

  describe('confirmStart', () => {
    it('returns not_found for a job that does not exist', async () => {
      expect(await store.confirmStart('u1', 'missing')).toEqual({ status: 'not_found' });
    });

    it('rejects a start for a job not yet awaiting confirmation', async () => {
      const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });

      const result = await store.confirmStart('u1', job.jobId);

      expect(result.status).toBe('conflict');
    });

    it('moves an awaiting_confirmation job to queued and returns it', async () => {
      const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });
      await store.patch('u1', job.jobId, { phase: 'awaiting_confirmation' });

      const result = await store.confirmStart('u1', job.jobId);

      expect(result).toMatchObject({ status: 'started', job: { phase: 'queued' } });
    });

    it('does not confirm start for another user’s job', async () => {
      const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });
      await store.patch('u1', job.jobId, { phase: 'awaiting_confirmation' });

      expect(await store.confirmStart('u2', job.jobId)).toEqual({ status: 'not_found' });
      const owned = await store.get('u1', job.jobId);
      expect(owned?.phase).toBe('awaiting_confirmation');
    });

    it('allows only one of two racing calls to start the same job', async () => {
      const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });
      await store.patch('u1', job.jobId, { phase: 'awaiting_confirmation' });

      const [first, second] = await Promise.all([
        store.confirmStart('u1', job.jobId),
        store.confirmStart('u1', job.jobId),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual(['conflict', 'started']);
    });

    it('rejects a third start attempt after the job already completed', async () => {
      const job = await store.create({ userId: 'u1', filepath: '/tmp/a.zip', filename: 'a.zip' });
      await store.patch('u1', job.jobId, { phase: 'awaiting_confirmation' });
      await store.confirmStart('u1', job.jobId);
      await store.patch('u1', job.jobId, { phase: 'completed', status: 'completed' });

      const result = await store.confirmStart('u1', job.jobId);

      expect(result.status).toBe('conflict');
    });
  });
});
