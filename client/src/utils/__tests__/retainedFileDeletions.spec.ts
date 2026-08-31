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

  it('persists submitted paste IDs across reloads', async () => {
    const { markPasteSubmitted, isPasteSubmitted } = await import('../files');
    markPasteSubmitted('submitted-file-id');
    expect(isPasteSubmitted('submitted-file-id')).toBe(true);

    // Simulate reload with a fresh import
    jest.resetModules();
    const reloaded = await import('../files');
    expect(reloaded.isPasteSubmitted('submitted-file-id')).toBe(true);
    expect(reloaded.isPasteSubmitted('other-file-id')).toBe(false);
  });

  it('makes submitted paste IDs readable by another tab', async () => {
    /** The tab that retries a retained deletion is rarely the tab that sent the message. Keeping
     * this evidence in `sessionStorage` left published tab presence as the only cross-tab record,
     * and that ages out on a fixed window, so a retry resuming after it deleted a sent file. */
    const { markPasteSubmitted } = await import('../files');
    markPasteSubmitted('sent-in-another-tab');

    /** A second tab shares `localStorage` and nothing else, so dropping this tab's session is what
     * standing in another tab looks like here. */
    sessionStorage.clear();
    jest.resetModules();
    const otherTab = await import('../files');

    expect(otherTab.isPasteSubmitted('sent-in-another-tab')).toBe(true);
  });

  it('keeps submitted paste IDs however long the deletion work takes', async () => {
    /** The work this evidence has to outlast is a retained deletion, and those carry no expiry of
     * their own, so any interval chosen here could be outlived by a suspended tab still holding
     * cleanup work. It is bounded by count instead of by time. */
    const { markPasteSubmitted, isPasteSubmitted } = await import('../files');
    markPasteSubmitted('long-ago');
    const stored = JSON.parse(
      localStorage.getItem('librechat-submitted-paste-file-ids') ?? '{}',
    ) as Record<string, number>;
    localStorage.setItem(
      'librechat-submitted-paste-file-ids',
      JSON.stringify({ ...stored, 'long-ago': Date.now() - 2_592_000_000 }),
    );

    expect(isPasteSubmitted('long-ago')).toBe(true);
  });

  it('persists marked pasted text IDs across reloads', async () => {
    const { markPastedTextFile, isPastedTextFileMarked } = await import('../files');
    markPastedTextFile('paste-upload-id');
    expect(isPastedTextFileMarked('paste-upload-id')).toBe(true);

    // Simulate reload with a fresh import
    jest.resetModules();
    const reloaded = await import('../files');
    expect(reloaded.isPastedTextFileMarked('paste-upload-id')).toBe(true);
    expect(reloaded.isPastedTextFileMarked('other-paste-id')).toBe(false);
  });
});
