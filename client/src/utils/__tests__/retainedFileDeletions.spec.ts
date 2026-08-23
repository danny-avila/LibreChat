import { FileSources } from 'librechat-data-provider';

const RETAINED_KEY = 'librechat-retained-file-deletions';

const record = {
  file_id: 'orphan-file',
  embedded: false,
  filepath: '/uploads/user-1/orphan.txt',
  source: FileSources.local,
};

describe('retained file deletions', () => {
  beforeEach(() => {
    jest.resetModules();
    sessionStorage.clear();
  });

  it('persists a retained deletion so a reload can still clean it up', async () => {
    const { retainFileDeletion } = await import('../files');
    retainFileDeletion(record);

    expect(JSON.parse(sessionStorage.getItem(RETAINED_KEY) ?? '[]')).toEqual([record]);
  });

  it('recovers a retained deletion written before the page reloaded', async () => {
    sessionStorage.setItem(RETAINED_KEY, JSON.stringify([record]));

    /** A fresh import stands in for the reload: the module-level map starts empty, so the stored
     * copy is the only thing that still knows the upload needs deleting. */
    const { takeRetainedFileDeletions } = await import('../files');

    expect(takeRetainedFileDeletions()).toEqual([record]);
  });

  it('stops persisting a deletion once it succeeds', async () => {
    const { retainFileDeletion, clearRetainedFileDeletion, takeRetainedFileDeletions } =
      await import('../files');
    retainFileDeletion(record);

    clearRetainedFileDeletion(record.file_id);

    expect(takeRetainedFileDeletions()).toEqual([]);
    expect(sessionStorage.getItem(RETAINED_KEY)).toBeNull();
  });

  it('wakes the retry listeners again after a failed attempt', async () => {
    jest.useFakeTimers();
    try {
      const {
        retainFileDeletion,
        subscribeRetainedFileDeletions,
        scheduleRetainedFileDeletionRetry,
      } = await import('../files');
      retainFileDeletion(record);
      const listener = jest.fn();
      subscribeRetainedFileDeletions(listener);

      scheduleRetainedFileDeletionRetry();
      expect(listener).not.toHaveBeenCalled();

      jest.advanceTimersByTime(5_000);

      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('lets one worker claim the pass and turns the others away', async () => {
    const { beginRetainedDeletionPass, endRetainedDeletionPass } = await import('../files');

    expect(beginRetainedDeletionPass()).toBe(true);
    expect(beginRetainedDeletionPass()).toBe(false);

    endRetainedDeletionPass();

    expect(beginRetainedDeletionPass()).toBe(true);
  });

  it('drops the queue on sign-out so it is never retried as another user', async () => {
    const { retainFileDeletion, clearRetainedFileDeletions, takeRetainedFileDeletions } =
      await import('../files');
    retainFileDeletion(record);

    clearRetainedFileDeletions();

    expect(takeRetainedFileDeletions()).toEqual([]);
    expect(sessionStorage.getItem(RETAINED_KEY)).toBeNull();
  });

  it('ignores a corrupt stored payload rather than failing to load', async () => {
    sessionStorage.setItem(RETAINED_KEY, 'not json');

    const { takeRetainedFileDeletions } = await import('../files');

    expect(takeRetainedFileDeletions()).toEqual([]);
  });
});
