import { renderHook, act } from '@testing-library/react';

import type { MouseEvent } from 'react';
import type { FilesDraft } from '~/utils';

const mockNewConversation = jest.fn();
const mockClearMessagesCache = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockClearAllDrafts = jest.fn();
const mockDeleteFiles = jest.fn();
const mockScheduleRetainedRetry = jest.fn();

/** A live composer entry: what the ownership check reads off the file map. */
type LiveFile = { file_id: string; attached?: boolean; progress?: number };

/** Values the module-level mocks read, so each test can stage its own scenario. */
const mockState = {
  saveDrafts: false,
  tabId: 'this-tab',
  filesDraft: { fileIds: [], pendingPastes: {} } as FilesDraft,
  pendingFilesDraft: { fileIds: [], pendingPastes: {} } as FilesDraft,
  files: new Map<string, LiveFile>(),
  retainedDeletions: [] as { file_id: string; filepath: string; source: string }[],
  persistedPendingDiscardIds: [] as string[],
  retainedListener: null as (() => void) | null,
  fileList: undefined as
    | {
        file_id: string;
        filepath: string;
        source: string;
        embedded?: boolean;
        temp_file_id?: string;
      }[]
    | undefined,
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: (key: unknown) => {
    if (typeof key === 'string' && key.startsWith('conversationIdByIndex')) {
      return 'convo-1';
    }
    if (typeof key === 'string' && key.startsWith('files-by-index')) {
      return mockState.files;
    }
    return mockState.saveDrafts;
  },
}));

jest.mock('~/hooks/useNewConvo', () => ({
  __esModule: true,
  default: () => ({ newConversation: mockNewConversation }),
}));

jest.mock('~/utils', () => ({
  clearMessagesCache: (...args: unknown[]) => mockClearMessagesCache(...args),
  clearAllDrafts: (...args: unknown[]) => mockClearAllDrafts(...args),
  getNewConversationDraftId: (index = 0) => (index === 0 ? 'new' : `new:${index}`),
  getPendingDraftId: (index = 0) => (index === 0 ? 'pending' : `pending:${index}`),
  getComposerDraftId: (index = 0, conversationId?: string | null) => {
    if (conversationId != null && conversationId !== '') {
      return conversationId;
    }
    return index === 0 ? 'new' : `new:${index}`;
  },
  getFilesDraft: (id: string) =>
    id === 'pending' || (typeof id === 'string' && id.startsWith('pending:'))
      ? mockState.pendingFilesDraft
      : mockState.filesDraft,
  isFilesDraftOwnedByThisTab: (draft: { tabId?: string }) =>
    draft.tabId == null || draft.tabId === mockState.tabId,
  loadPendingDiscardIds: () => [...mockState.persistedPendingDiscardIds],
  storePendingDiscardIds: (_index: number, ids: string[]) => {
    mockState.persistedPendingDiscardIds = [...ids];
  },
  subscribeRetainedFileDeletions: (listener: () => void) => {
    mockState.retainedListener = listener;
    return () => {
      mockState.retainedListener = null;
    };
  },
  takeRetainedFileDeletions: () => mockState.retainedDeletions,
  clearRetainedFileDeletion: (fileId: string) => {
    mockState.retainedDeletions = mockState.retainedDeletions.filter(
      (record) => record.file_id !== fileId,
    );
  },
  failedFileIdsFrom: (result: { failedFileIds?: string[] } | void) =>
    result != null && Array.isArray(result.failedFileIds) ? result.failedFileIds : [],
  scheduleRetainedFileDeletionRetry: () => mockScheduleRetainedRetry(),
}));

jest.mock('~/data-provider', () => ({
  useGetFiles: () => ({ data: mockState.fileList }),
  useDeleteFilesMutation: () => ({ mutateAsync: mockDeleteFiles }),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    conversationIdByIndex: (index: number) => `conversationIdByIndex-${index}`,
    filesByIndex: (index: number) => `files-by-index-${index}`,
    saveDrafts: 'saveDrafts',
  },
}));

jest.mock('librechat-data-provider', () => ({
  QueryKeys: { messages: 'messages' },
}));

import useNewChat from '../useNewChat';

const clickEvent = (overrides: Partial<MouseEvent<HTMLElement>> = {}) =>
  ({
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: jest.fn(),
    ...overrides,
  }) as unknown as MouseEvent<HTMLElement>;

describe('useNewChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteFiles.mockResolvedValue(undefined);
    mockState.saveDrafts = false;
    mockState.tabId = 'this-tab';
    mockState.filesDraft = { fileIds: [], pendingPastes: {} };
    mockState.pendingFilesDraft = { fileIds: [], pendingPastes: {} };
    mockState.files = new Map();
    mockState.fileList = undefined;
    mockState.retainedDeletions = [];
    mockState.persistedPendingDiscardIds = [];
    mockState.retainedListener = null;
    mockScheduleRetainedRetry.mockClear();
  });

  it('clears the outgoing conversation before resetting', () => {
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockClearMessagesCache).toHaveBeenCalledWith(expect.anything(), 'convo-1');
    expect(mockInvalidateQueries).toHaveBeenCalledWith(['messages']);
    expect(mockNewConversation).toHaveBeenCalledTimes(1);
  });

  it('drops the unsaved-chat draft before the reset restores from it', () => {
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockClearAllDrafts).toHaveBeenCalledWith('new');
    expect(mockClearAllDrafts.mock.invocationCallOrder[0]).toBeLessThan(
      mockNewConversation.mock.invocationCallOrder[0],
    );
  });

  it('drops only its own pane unsaved-chat draft', () => {
    const { result } = renderHook(() => useNewChat({ index: 1 }));

    act(() => result.current.startNewChat());

    expect(mockClearAllDrafts).toHaveBeenCalledWith('new:1');
    expect(mockClearAllDrafts).not.toHaveBeenCalledWith('new');
  });

  it('deletes the draft uploads a draft-saving user is discarding with the draft', () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['stored-file'],
      pendingPastes: { 'in-flight-paste': { text: 'x', selectionStart: 0 } },
    };
    mockState.files = new Map([
      ['stored-file', { file_id: 'stored-file', progress: 1 }],
      ['in-flight-paste', { file_id: 'in-flight-paste', progress: 0.4 }],
    ]);
    mockState.fileList = [
      { file_id: 'stored-file', filepath: '/uploads/stored.txt', source: 'local' },
      { file_id: 'in-flight-paste', filepath: '/uploads/pending.txt', source: 'local' },
    ];
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        {
          file_id: 'stored-file',
          embedded: false,
          filepath: '/uploads/stored.txt',
          source: 'local',
        },
        {
          file_id: 'in-flight-paste',
          embedded: false,
          filepath: '/uploads/pending.txt',
          source: 'local',
        },
      ],
    });
    expect(mockDeleteFiles.mock.invocationCallOrder[0]).toBeLessThan(
      mockClearAllDrafts.mock.invocationCallOrder[0],
    );
  });

  it('leaves deletion to the reset path when draft saving is off', () => {
    mockState.saveDrafts = false;
    mockState.filesDraft = {
      fileIds: ['stored-file'],
      pendingPastes: {},
    };
    mockState.fileList = [
      { file_id: 'stored-file', filepath: '/uploads/stored.txt', source: 'local' },
    ];
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it('deletes embedded owned uploads with the discarded draft', () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['known', 'embedded', 'missing'],
      pendingPastes: {},
    };
    mockState.files = new Map([
      ['known', { file_id: 'known', progress: 1 }],
      ['embedded', { file_id: 'embedded', progress: 1 }],
    ]);
    mockState.fileList = [
      { file_id: 'known', filepath: '/uploads/known.txt', source: 'local' },
      { file_id: 'embedded', filepath: '/uploads/embedded.txt', source: 'local', embedded: true },
    ];
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        { file_id: 'known', embedded: false, filepath: '/uploads/known.txt', source: 'local' },
        {
          file_id: 'embedded',
          embedded: true,
          filepath: '/uploads/embedded.txt',
          source: 'local',
        },
      ],
    });
  });

  it('spares a draft another browser tab still owns', () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['other-tab-file'],
      pendingPastes: {},
      tabId: 'other-tab',
    };
    mockState.fileList = [
      { file_id: 'other-tab-file', filepath: '/uploads/other.txt', source: 'local' },
    ];
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).not.toHaveBeenCalled();
    expect(mockClearAllDrafts).not.toHaveBeenCalledWith('new');
    expect(mockClearAllDrafts).toHaveBeenCalledWith('pending');
  });

  it('deletes a draft carrying this tab stamp', () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['own-file'],
      pendingPastes: {},
      tabId: 'this-tab',
    };
    mockState.files = new Map([['own-file', { file_id: 'own-file', progress: 1 }]]);
    mockState.fileList = [{ file_id: 'own-file', filepath: '/uploads/own.txt', source: 'local' }];
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        { file_id: 'own-file', embedded: false, filepath: '/uploads/own.txt', source: 'local' },
      ],
    });
  });

  it('spares library files the draft recorded through a re-attach', () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['library-file', 'own-file'],
      pendingPastes: {},
    };
    /** `attached: true` is how a re-attached stored file enters the composer: it has other
     * references, so discarding this draft must not delete it. */
    mockState.files = new Map([
      ['library-file', { file_id: 'library-file', attached: true, progress: 1 }],
      ['own-file', { file_id: 'own-file', progress: 1 }],
    ]);
    mockState.fileList = [
      { file_id: 'library-file', filepath: '/uploads/library.txt', source: 'local' },
      { file_id: 'own-file', filepath: '/uploads/own.txt', source: 'local' },
    ];
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        { file_id: 'own-file', embedded: false, filepath: '/uploads/own.txt', source: 'local' },
      ],
    });
  });

  it('deletes a draft-owned paste before the composer map is rebuilt after a reload', () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['late-paste'],
      pendingPastes: {},
      pastedTextIds: ['late-paste'],
    };
    /** The reload just happened: the files query has not restored any chips into the map yet. */
    mockState.fileList = [
      { file_id: 'late-paste', filepath: '/uploads/late.txt', source: 'local' },
    ];
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        { file_id: 'late-paste', embedded: false, filepath: '/uploads/late.txt', source: 'local' },
      ],
    });
  });

  it('defers a draft-owned paste whose record has not arrived after a reload', async () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['late-paste'],
      pendingPastes: {},
      pastedTextIds: ['late-paste'],
    };
    const { result, rerender } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).not.toHaveBeenCalled();

    mockState.filesDraft = { fileIds: [], pendingPastes: {} };
    mockState.fileList = [
      { file_id: 'late-paste', filepath: '/uploads/late.txt', source: 'local' },
    ];
    await act(async () => {
      rerender();
    });

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        { file_id: 'late-paste', embedded: false, filepath: '/uploads/late.txt', source: 'local' },
      ],
    });
  });

  it('drains a deletion another flow retained after a failed request', async () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['stored-file'],
      pendingPastes: {},
    };
    mockState.files = new Map([['stored-file', { file_id: 'stored-file', progress: 1 }]]);
    mockState.retainedDeletions = [
      { file_id: 'retained-file', filepath: '/uploads/retained.txt', source: 'local' },
    ];
    const { result, rerender } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    /** The retained payload rides along the retry effect's next files-cache tick. */
    mockState.filesDraft = { fileIds: [], pendingPastes: {} };
    mockState.files = new Map();
    mockState.fileList = [
      { file_id: 'stored-file', filepath: '/uploads/stored.txt', source: 'local' },
    ];
    await act(async () => {
      rerender();
    });

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        {
          file_id: 'stored-file',
          embedded: false,
          filepath: '/uploads/stored.txt',
          source: 'local',
        },
        { file_id: 'retained-file', filepath: '/uploads/retained.txt', source: 'local' },
      ],
    });
    expect(mockState.retainedDeletions).toHaveLength(0);
  });

  it('keeps retained deletions when the retried request fails again', async () => {
    mockDeleteFiles.mockRejectedValueOnce(new Error('offline'));
    mockState.retainedDeletions = [
      { file_id: 'retained-file', filepath: '/uploads/retained.txt', source: 'local' },
    ];
    const { result, rerender } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    mockState.fileList = [];
    await act(async () => {
      rerender();
    });

    expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
    expect(mockState.retainedDeletions).toHaveLength(1);
    /** A second failure moves nothing this effect watches, so the payload only gets another
     * attempt if one is scheduled. */
    expect(mockScheduleRetainedRetry).toHaveBeenCalled();
  });

  it('retries a deferred deletion whose request failed', async () => {
    mockDeleteFiles.mockRejectedValueOnce(new Error('offline'));
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['in-flight'],
      pendingPastes: {},
    };
    mockState.files = new Map([['in-flight', { file_id: 'in-flight', progress: 0.4 }]]);
    const { result, rerender } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    mockState.filesDraft = { fileIds: [], pendingPastes: {} };
    mockState.files = new Map();
    mockState.fileList = [
      { file_id: 'in-flight', filepath: '/uploads/in-flight.txt', source: 'local' },
    ];
    await act(async () => {
      rerender();
    });
    expect(mockDeleteFiles).toHaveBeenCalledTimes(1);

    /** The failed delete kept the id; the next cache update retries it. */
    mockState.fileList = [
      { file_id: 'in-flight', filepath: '/uploads/in-flight.txt', source: 'local' },
    ];
    await act(async () => {
      rerender();
    });

    expect(mockDeleteFiles).toHaveBeenCalledTimes(2);
  });

  it('retains an immediate deletion whose request failed for a retry', async () => {
    mockDeleteFiles.mockRejectedValueOnce(new Error('offline'));
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['stored-file'],
      pendingPastes: {},
    };
    mockState.files = new Map([['stored-file', { file_id: 'stored-file', progress: 1 }]]);
    mockState.fileList = [
      { file_id: 'stored-file', filepath: '/uploads/stored.txt', source: 'local' },
    ];
    const { result, rerender } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());
    expect(mockDeleteFiles).toHaveBeenCalledTimes(1);

    mockState.filesDraft = { fileIds: [], pendingPastes: {} };
    mockState.files = new Map();
    mockState.fileList = [
      { file_id: 'stored-file', filepath: '/uploads/stored.txt', source: 'local' },
    ];
    await act(async () => {
      rerender();
    });

    expect(mockDeleteFiles).toHaveBeenCalledTimes(2);
    expect(mockDeleteFiles).toHaveBeenLastCalledWith({
      files: [
        {
          file_id: 'stored-file',
          embedded: false,
          filepath: '/uploads/stored.txt',
          source: 'local',
        },
      ],
    });
  });

  it('spares draft ids the composer no longer shows, whose ownership is unknowable', () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['absent-file'],
      pendingPastes: {},
    };
    mockState.fileList = [
      { file_id: 'absent-file', filepath: '/uploads/absent.txt', source: 'local' },
    ];
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it('deletes an in-flight upload once its record arrives in the files cache', async () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['in-flight'],
      pendingPastes: {},
    };
    mockState.files = new Map([['in-flight', { file_id: 'in-flight', progress: 0.4 }]]);
    const { result, rerender } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).not.toHaveBeenCalled();

    /** What the reset itself does: the draft key is dropped and the composer map cleared. */
    mockState.filesDraft = { fileIds: [], pendingPastes: {} };
    mockState.files = new Map();
    mockState.fileList = [
      { file_id: 'in-flight', filepath: '/uploads/in-flight.txt', source: 'local' },
    ];
    await act(async () => {
      rerender();
    });

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        {
          file_id: 'in-flight',
          embedded: false,
          filepath: '/uploads/in-flight.txt',
          source: 'local',
        },
      ],
    });
  });

  it('deletes a deferred upload by its temporary request id once the record arrives', async () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['request-uuid'],
      pendingPastes: {},
    };
    mockState.files = new Map([['request-uuid', { file_id: 'request-uuid', progress: 0.4 }]]);
    const { result, rerender } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).not.toHaveBeenCalled();

    /** The cache keys the record by the server-assigned id and keeps the request uuid as
     * its temp id; the discard was tracked under the request uuid. */
    mockState.filesDraft = { fileIds: [], pendingPastes: {} };
    mockState.files = new Map();
    mockState.fileList = [
      {
        file_id: 'server-id',
        temp_file_id: 'request-uuid',
        filepath: '/uploads/uploaded.txt',
        source: 'local',
      },
    ];
    await act(async () => {
      rerender();
    });

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        {
          file_id: 'server-id',
          embedded: false,
          filepath: '/uploads/uploaded.txt',
          source: 'local',
        },
      ],
    });
  });

  it('keeps earlier deferred deletions when a second reset defers more', async () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = { fileIds: ['upload-a'], pendingPastes: {} };
    mockState.files = new Map([['upload-a', { file_id: 'upload-a', progress: 0.4 }]]);
    const { result, rerender } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    /** A second new chat before the first upload completed, with a fresh upload of its own.
     * The rerender stands in for the re-render the map change causes in a live composer. */
    mockState.filesDraft = { fileIds: ['upload-b'], pendingPastes: {} };
    mockState.files = new Map([['upload-b', { file_id: 'upload-b', progress: 0.4 }]]);
    act(() => rerender());
    act(() => result.current.startNewChat());

    mockState.filesDraft = { fileIds: [], pendingPastes: {} };
    mockState.files = new Map();
    mockState.fileList = [
      { file_id: 'upload-a', filepath: '/uploads/a.txt', source: 'local' },
      { file_id: 'upload-b', filepath: '/uploads/b.txt', source: 'local' },
    ];
    await act(async () => {
      rerender();
    });

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        { file_id: 'upload-a', embedded: false, filepath: '/uploads/a.txt', source: 'local' },
        { file_id: 'upload-b', embedded: false, filepath: '/uploads/b.txt', source: 'local' },
      ],
    });
  });

  it('clears the pending draft a running response parked this pane under', () => {
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockClearAllDrafts).toHaveBeenCalledWith('pending');
    expect(mockClearAllDrafts).toHaveBeenCalledWith('new');
  });

  it('deletes pending-draft uploads before clearing them', () => {
    mockState.saveDrafts = true;
    mockState.pendingFilesDraft = {
      fileIds: ['queued-file'],
      pendingPastes: {},
    };
    mockState.files = new Map([['queued-file', { file_id: 'queued-file', progress: 1 }]]);
    mockState.fileList = [
      { file_id: 'queued-file', filepath: '/uploads/queued.txt', source: 'local' },
    ];
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        {
          file_id: 'queued-file',
          embedded: false,
          filepath: '/uploads/queued.txt',
          source: 'local',
        },
      ],
    });
    expect(mockDeleteFiles.mock.invocationCallOrder[0]).toBeLessThan(
      mockClearAllDrafts.mock.invocationCallOrder[0],
    );
    expect(mockClearAllDrafts).toHaveBeenCalledWith('pending');
  });

  it('spares a pending draft another browser tab still owns', () => {
    mockState.saveDrafts = true;
    mockState.pendingFilesDraft = {
      fileIds: ['other-pending-file'],
      pendingPastes: {},
      tabId: 'other-tab',
    };
    mockState.fileList = [
      { file_id: 'other-pending-file', filepath: '/uploads/other-pending.txt', source: 'local' },
    ];
    const { result } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    expect(mockDeleteFiles).not.toHaveBeenCalled();
    expect(mockClearAllDrafts).not.toHaveBeenCalledWith('pending');
    expect(mockClearAllDrafts).toHaveBeenCalledWith('new');
  });

  it('spares a reattached file from a retained deletion retry', async () => {
    mockState.retainedDeletions = [
      { file_id: 'reattached-file', filepath: '/uploads/reattached.txt', source: 'local' },
    ];
    mockState.files = new Map([['reattached-file', { file_id: 'reattached-file', progress: 1 }]]);
    mockState.fileList = [
      { file_id: 'reattached-file', filepath: '/uploads/reattached.txt', source: 'local' },
    ];
    const { result, rerender } = renderHook(() => useNewChat());

    await act(async () => {
      rerender();
    });

    expect(mockDeleteFiles).not.toHaveBeenCalled();
    expect(mockState.retainedDeletions).toHaveLength(0);
    expect(result.current).toBeDefined();
  });

  it('keeps retained deletions when the API reports a partial failure', async () => {
    mockDeleteFiles.mockResolvedValueOnce({
      message: 'Some files could not be deleted',
      deletedFileIds: [],
      failedFileIds: ['retained-file'],
    });
    mockState.retainedDeletions = [
      { file_id: 'retained-file', filepath: '/uploads/retained.txt', source: 'local' },
    ];
    mockState.fileList = [
      { file_id: 'retained-file', filepath: '/uploads/retained.txt', source: 'local' },
    ];
    const { rerender } = renderHook(() => useNewChat());

    await act(async () => {
      rerender();
    });

    expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
    expect(mockState.retainedDeletions).toHaveLength(1);
  });

  it('retries a retained deletion when the retain store notifies', async () => {
    mockState.fileList = [
      { file_id: 'retained-file', filepath: '/uploads/retained.txt', source: 'local' },
    ];
    renderHook(() => useNewChat());

    mockState.retainedDeletions = [
      { file_id: 'retained-file', filepath: '/uploads/retained.txt', source: 'local' },
    ];
    await act(async () => {
      mockState.retainedListener?.();
    });

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [{ file_id: 'retained-file', filepath: '/uploads/retained.txt', source: 'local' }],
    });
  });

  it('resumes deferred discards persisted from a previous mount', async () => {
    mockState.persistedPendingDiscardIds = ['late-paste'];
    mockState.fileList = [
      { file_id: 'late-paste', filepath: '/uploads/late.txt', source: 'local' },
    ];
    renderHook(() => useNewChat());

    await act(async () => undefined);

    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        {
          file_id: 'late-paste',
          embedded: false,
          filepath: '/uploads/late.txt',
          source: 'local',
        },
      ],
    });
  });

  it('spares a deferred upload that came back attached to the fresh composer', async () => {
    mockState.saveDrafts = true;
    mockState.filesDraft = {
      fileIds: ['in-flight'],
      pendingPastes: {},
    };
    mockState.files = new Map([['in-flight', { file_id: 'in-flight', progress: 0.4 }]]);
    const { result, rerender } = renderHook(() => useNewChat());

    act(() => result.current.startNewChat());

    /** The user immediately re-attached the same file (dedupe lands on the same id). */
    mockState.filesDraft = { fileIds: [], pendingPastes: {} };
    mockState.files = new Map([['in-flight', { file_id: 'in-flight', progress: 1 }]]);
    mockState.fileList = [
      { file_id: 'in-flight', filepath: '/uploads/in-flight.txt', source: 'local' },
    ];
    await act(async () => {
      rerender();
    });

    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it('runs the optional callback after the reset', () => {
    const onNewChat = jest.fn();
    const { result } = renderHook(() => useNewChat({ onNewChat }));

    act(() => result.current.startNewChat());

    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(mockNewConversation.mock.invocationCallOrder[0]).toBeLessThan(
      onNewChat.mock.invocationCallOrder[0],
    );
  });

  it('works without a callback', () => {
    const { result } = renderHook(() => useNewChat());

    expect(() => act(() => result.current.startNewChat())).not.toThrow();
    expect(mockNewConversation).toHaveBeenCalledTimes(1);
  });

  it('takes over a plain left click', () => {
    const { result } = renderHook(() => useNewChat());
    const event = clickEvent();

    act(() => result.current.handleNewChatClick(event));

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mockNewConversation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['middle', { button: 1 }],
  ])('lets a %s click fall through to the browser', (_label, overrides) => {
    const { result } = renderHook(() => useNewChat());
    const event = clickEvent(overrides);

    act(() => result.current.handleNewChatClick(event));

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mockNewConversation).not.toHaveBeenCalled();
  });
});
