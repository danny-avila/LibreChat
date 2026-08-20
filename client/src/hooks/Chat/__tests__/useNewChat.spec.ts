import { renderHook, act } from '@testing-library/react';

import type { MouseEvent } from 'react';
import type { FilesDraft } from '~/utils';

const mockNewConversation = jest.fn();
const mockClearMessagesCache = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockClearAllDrafts = jest.fn();
const mockDeleteFiles = jest.fn();

/** A live composer entry: what the ownership check reads off the file map. */
type LiveFile = { file_id: string; attached?: boolean; progress?: number };

/** Values the module-level mocks read, so each test can stage its own scenario. */
const mockState = {
  saveDrafts: false,
  tabId: 'this-tab',
  filesDraft: { fileIds: [], pendingPastes: {} } as FilesDraft,
  files: new Map<string, LiveFile>(),
  fileList: undefined as
    | { file_id: string; filepath: string; source: string; embedded?: boolean }[]
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
  getFilesDraft: () => mockState.filesDraft,
  getBrowserTabId: () => mockState.tabId,
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
    mockState.saveDrafts = false;
    mockState.tabId = 'this-tab';
    mockState.filesDraft = { fileIds: [], pendingPastes: {} };
    mockState.files = new Map();
    mockState.fileList = undefined;
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

  it('skips draft ids without a deletable record rather than guessing at payloads', () => {
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
    expect(mockClearAllDrafts).toHaveBeenCalledWith('new');
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
