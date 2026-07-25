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
});
