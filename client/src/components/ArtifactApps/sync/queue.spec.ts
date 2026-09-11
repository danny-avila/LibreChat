import type { TSyncArtifactAppRequest } from 'librechat-data-provider';
import {
  clearArtifactSyncQueueForTests,
  completeArtifactSync,
  enqueueArtifactSync,
  listArtifactSyncQueue,
  rescheduleArtifactSync,
} from './queue';

const request: TSyncArtifactAppRequest = {
  title: 'Chart',
  artifact: { type: 'react', content: '<div />' },
  source: { conversationId: 'conversation-1', sourceKey: 'identifier:chart' },
};

describe('artifact sync queue', () => {
  beforeEach(async () => {
    await clearArtifactSyncQueueForTests();
  });

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
});
