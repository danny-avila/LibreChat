import type { UserGenerationControl } from './generations';
import { stopUserGenerations } from './generations';

/** Methods read `this`, as the real GenerationJobManager does, so an unbound call throws. */
class FakeJobManager {
  private jobs = new Map([
    ['s1', { createdAt: 7, metadata: { userId: 'u1', terminalPersistencePending: false } }],
    ['s2', { createdAt: 8, metadata: { userId: 'other' } }],
  ]);

  readonly aborted: string[] = [];

  async getAccountCleanupJobIdsForUser() {
    return [...this.jobs.keys()];
  }

  async getCleanupJob(streamId: string) {
    return this.jobs.get(streamId);
  }

  async abortJob(streamId: string) {
    this.aborted.push(streamId);
    return { success: true };
  }
}

describe('stopUserGenerations', () => {
  it('stops only the user jobs using a manager whose methods depend on this', async () => {
    const manager = new FakeJobManager();

    await expect(
      stopUserGenerations('u1', undefined, manager as unknown as UserGenerationControl, 0),
    ).resolves.toBeUndefined();

    expect(manager.aborted).toEqual(['s1']);
  });

  it('throws when a stop is not confirmed', async () => {
    const manager = new FakeJobManager();
    manager.abortJob = async function (this: FakeJobManager, streamId: string) {
      this.aborted.push(streamId);
      return { success: false };
    };

    await expect(
      stopUserGenerations('u1', undefined, manager as unknown as UserGenerationControl, 0),
    ).rejects.toThrow('could not be confirmed stopped');
  });

  it('catches a job created right after the first drain on the second drain', async () => {
    const manager = new FakeJobManager();
    const listed = manager.getAccountCleanupJobIdsForUser.bind(manager);
    let calls = 0;
    manager.getAccountCleanupJobIdsForUser = async () => {
      calls += 1;
      if (calls === 2) {
        (manager as unknown as { jobs: Map<string, unknown> }).jobs.set('late', {
          createdAt: 9,
          metadata: { userId: 'u1' },
        });
      }
      return listed();
    };

    await stopUserGenerations('u1', undefined, manager as unknown as UserGenerationControl, 0);

    expect(manager.aborted).toEqual(['s1', 'late']);
  });
});
