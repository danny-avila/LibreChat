import { renderHook, act } from '@testing-library/react';

/** This jsdom build lacks `Blob.prototype.text`, which browsers have had for years; the
 * paste editor reads chip text through it, so give the test environment the same primitive. */
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function (): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(this);
    });
  };
}

import { FileSources } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { UploadLifecycleCallbacks } from '../useFileHandling';
import type { FilesDraft } from '~/utils';
import type { ExtendedFile } from '~/common';

const mockShowToast = jest.fn();
const mockSetValue = jest.fn();
const mockDeleteFile = jest.fn();
const mockDeleteFiles = jest.fn();
const mockRouteFiles = jest.fn();
const mockFileDownload = jest.fn();
const mockMarkPastedTextFile = jest.fn();
const mockAddPastedTextDraftFile = jest.fn();

/** Values the module-level mocks read, so each test can stage its own scenario. */
const mockState = {
  conversation: { conversationId: 'conversation-a', endpoint: 'openAI' } as TConversation,
  draftToken: Symbol('new-conversation-draft'),
  saveDrafts: true,
  tabId: 'this-tab',
  fileList: [] as TFile[],
  draftsById: {} as Record<string, FilesDraft>,
};

type TFile = { file_id: string; text?: string };

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => mockState.saveDrafts,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { saveDrafts: { key: 'saveDrafts' } },
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ conversation: mockState.conversation, isSubmitting: false }),
  useChatFormContext: () => ({
    getValues: () => '',
    setValue: mockSetValue,
  }),
}));

jest.mock('../useFileUploadRouter', () => ({
  __esModule: true,
  default: () => mockRouteFiles,
}));

jest.mock('../useFileDeletion', () => ({
  __esModule: true,
  default: () => ({ deleteFile: mockDeleteFile }),
}));

jest.mock('~/data-provider', () => ({
  useGetFiles: () => ({ data: mockState.fileList }),
  useDeleteFilesMutation: () => ({ mutateAsync: mockDeleteFiles }),
}));

jest.mock('~/utils', () => ({
  forceResize: jest.fn(),
  getNewConversationDraftToken: () => mockState.draftToken,
  getComposerDraftId: (index: number, conversationId: string | null, isSubmitting = false) =>
    `${conversationId ?? 'new'}:${index}:${isSubmitting ? 'pending' : 'idle'}`,
  getFilesDraftCached: (id: string) =>
    mockState.draftsById[id] ?? { fileIds: [], pendingPastes: {}, pastedTextIds: [] },
  getBrowserTabId: () => mockState.tabId,
  markPastedTextFile: (...args: unknown[]) => mockMarkPastedTextFile(...args),
  addPastedTextDraftFile: (...args: unknown[]) => mockAddPastedTextDraftFile(...args),
  nextPastedTextFilename: jest.requireActual('~/utils/files').nextPastedTextFilename,
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  dataService: { getFileDownload: (...args: unknown[]) => mockFileDownload(...args) },
  isAssistantsEndpoint: () => false,
}));

import usePastedTextEdit from '../usePastedTextEdit';

const pastedFile = (overrides: Partial<ExtendedFile> = {}): ExtendedFile => ({
  file_id: 'pasted-file',
  filename: 'pasted-text.txt',
  type: 'text/plain',
  progress: 1,
  size: 4000,
  file: new File(['the original paste'], 'pasted-text.txt', { type: 'text/plain' }),
  ...overrides,
});

describe('usePastedTextEdit', () => {
  let capturedLifecycle: UploadLifecycleCallbacks | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedLifecycle = undefined;
    mockState.conversation = {
      conversationId: 'conversation-a',
      endpoint: 'openAI',
    } as TConversation;
    mockState.draftToken = Symbol('new-conversation-draft');
    mockState.saveDrafts = true;
    mockState.tabId = 'this-tab';
    mockState.fileList = [];
    mockState.draftsById = {};
    mockRouteFiles.mockImplementation(
      (_files: unknown, _toolResource: unknown, lifecycle: UploadLifecycleCallbacks) => {
        capturedLifecycle = lifecycle;
        return Promise.resolve(true);
      },
    );
  });

  const renderEditor = (files?: Map<string, ExtendedFile>) =>
    renderHook(
      ({ files: composerFiles }) =>
        usePastedTextEdit({
          files: composerFiles,
          setFiles: jest.fn(),
          textAreaRef: { current: null },
        }),
      {
        initialProps: {
          files:
            files ??
            new Map<string, ExtendedFile>([
              ['pasted-file', pastedFile()],
              ['restored-file', pastedFile({ file_id: 'restored-file', file: undefined })],
            ]),
        },
      },
    );

  const openEditor = async () => {
    const editor = renderEditor();
    await act(async () => {
      await editor.result.current.openEditor(pastedFile());
    });
    return editor;
  };

  it('keeps the original attached until the replacement upload succeeds', async () => {
    const editor = await openEditor();

    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });

    expect(mockRouteFiles).toHaveBeenCalledTimes(1);
    expect(mockDeleteFile).not.toHaveBeenCalled();

    await act(async () => {
      capturedLifecycle?.onSuccess?.('replacement-file');
    });

    expect(mockDeleteFile).toHaveBeenCalledWith({
      file: expect.objectContaining({ file_id: 'pasted-file' }),
      setFiles: expect.anything(),
    });
  });

  it('leaves the original attached when the replacement is rejected', async () => {
    mockRouteFiles.mockResolvedValue(false);
    const editor = await openEditor();

    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });

    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_pasted_text_save_error' }),
    );
  });

  it('restores the corrections when the replacement is rejected', async () => {
    mockRouteFiles.mockResolvedValue(false);
    const editor = await openEditor();

    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });

    expect(editor.result.current.editing?.text).toBe('corrected');
    expect(editor.result.current.editing?.file.file_id).toBe('pasted-file');
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_pasted_text_save_error' }),
    );
  });

  it('restores the corrections when the replacement upload fails', async () => {
    const editor = await openEditor();

    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });
    expect(editor.result.current.editing).toBeNull();
    await act(async () => {
      capturedLifecycle?.onError?.('replacement-file');
    });

    expect(editor.result.current.editing?.text).toBe('corrected');
  });

  it('leaves the original attached when the replacement upload fails', async () => {
    const editor = await openEditor();

    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });
    await act(async () => {
      capturedLifecycle?.onError?.('replacement-file');
    });

    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('deletes a restored paste record the normal removal path would keep', async () => {
    mockState.draftsById = {
      'conversation-a:0:idle': { fileIds: [], pendingPastes: {}, pastedTextIds: ['pasted-file'] },
    };
    const editor = renderEditor();
    const restored = pastedFile({
      attached: true,
      filepath: '/uploads/user123/pasted-text.txt',
      source: FileSources.local,
    });

    await act(async () => {
      await editor.result.current.openEditor(restored);
    });
    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });
    await act(async () => {
      capturedLifecycle?.onSuccess?.('replacement-file');
    });

    /** `attached: true` is what restoration stamps on, and what makes the shared removal
     * path keep the server record; the paste's own upload must not survive the edit. */
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        expect.objectContaining({
          file_id: 'pasted-file',
          filepath: '/uploads/user123/pasted-text.txt',
        }),
      ],
    });
  });

  it('spares a restored paste whose draft another tab wrote last', async () => {
    /** Two tabs can restore the same conversation draft; the deleting composer only owns the
     * claim when the draft carries its own tab stamp (or predates stamping). */
    mockState.draftsById = {
      'conversation-a:0:idle': {
        fileIds: [],
        pendingPastes: {},
        pastedTextIds: ['pasted-file'],
        tabId: 'other-tab',
      },
    };
    const editor = renderEditor();
    const restored = pastedFile({
      attached: true,
      filepath: '/uploads/user123/pasted-text.txt',
      source: FileSources.local,
    });

    await act(async () => {
      await editor.result.current.openEditor(restored);
    });
    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });
    await act(async () => {
      capturedLifecycle?.onSuccess?.('replacement-file');
    });

    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it('follows the draft a finishing response migrated the claim to', async () => {
    /** The edit was captured while submitting, so its key was the pending one; the run then
     * finished and autosave moved the record to the conversation key. The claim must be found
     * under either. */
    mockState.draftsById = {
      'conversation-a:0:pending': {
        fileIds: [],
        pendingPastes: {},
        pastedTextIds: ['pasted-file'],
      },
    };
    const editor = renderEditor();
    const restored = pastedFile({
      attached: true,
      filepath: '/uploads/user123/pasted-text.txt',
      source: FileSources.local,
    });

    await act(async () => {
      await editor.result.current.openEditor(restored);
    });
    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });
    await act(async () => {
      capturedLifecycle?.onSuccess?.('replacement-file');
    });

    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [expect.objectContaining({ file_id: 'pasted-file' })],
    });
  });

  it('spares a sent paste re-attached from the library', async () => {
    /** The registry remembers the id even though the draft does not: the paste was sent, and
     * the stored file was re-attached, so its record is shared with the earlier message. */
    const editor = renderEditor();
    const reattached = pastedFile({
      attached: true,
      filepath: '/uploads/user123/pasted-text.txt',
      source: FileSources.local,
    });

    await act(async () => {
      await editor.result.current.openEditor(reattached);
    });
    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });
    await act(async () => {
      capturedLifecycle?.onSuccess?.('replacement-file');
    });

    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it('discards a stale editor resolution that loses to a later click', async () => {
    const gates: Array<(text: string) => void> = [];
    mockFileDownload.mockImplementation(
      () =>
        new Promise((resolve) => {
          gates.push((text: string) => resolve({ data: new Blob([text], { type: 'text/plain' }) }));
        }),
    );
    const slow = pastedFile({ file_id: 'restored-file', file: undefined });
    const fast = pastedFile({ file_id: 'pasted-file' });
    const editor = renderEditor();
    let slowOpen: Promise<void> = Promise.resolve();
    await act(async () => {
      slowOpen = editor.result.current.openEditor(slow);
    });
    await act(async () => {
      await editor.result.current.openEditor(fast);
    });
    expect(editor.result.current.editing?.file.file_id).toBe('pasted-file');

    /** The earlier, slower click resolves last and must not take the dialog back. */
    await act(async () => {
      gates[0]?.('the slow paste');
      await slowOpen;
    });

    expect(editor.result.current.editing?.file.file_id).toBe('pasted-file');
  });

  it('records the replacement as a generated paste', async () => {
    const editor = await openEditor();

    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });

    /** Without provenance the fresh chip renders as an ordinary attachment and immediately
     * loses the Edit and Move back affordances it exists for. */
    expect(mockMarkPastedTextFile).toHaveBeenCalledWith(expect.any(String));
    expect(mockAddPastedTextDraftFile).toHaveBeenCalledWith({
      id: expect.any(String),
      fileId: expect.any(String),
    });
  });

  it('marks replacement provenance in memory when draft saving is off', async () => {
    mockState.saveDrafts = false;
    const editor = await openEditor();

    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });

    expect(mockMarkPastedTextFile).toHaveBeenCalledWith(expect.any(String));
    expect(mockAddPastedTextDraftFile).not.toHaveBeenCalled();
  });

  it('keeps the original when the composer changes while the replacement uploads', async () => {
    const editor = await openEditor();

    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });
    mockState.conversation = {
      conversationId: 'conversation-b',
      endpoint: 'openAI',
    } as TConversation;
    await act(async () => {
      editor.rerender({ files: new Map<string, ExtendedFile>() });
    });

    await act(async () => {
      capturedLifecycle?.onSuccess?.('replacement-file');
    });

    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('keeps the original when a send cleared the composer while the replacement uploads', async () => {
    const editor = await openEditor();

    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });
    await act(async () => {
      editor.rerender({ files: new Map<string, ExtendedFile>() });
    });

    await act(async () => {
      capturedLifecycle?.onSuccess?.('replacement-file');
    });

    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('aborts a move into a composer that was reset while the text resolved', async () => {
    let releaseDownload: (text: string) => void = () => undefined;
    mockFileDownload.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseDownload = (text: string) =>
            resolve({ data: new Blob([text], { type: 'text/plain' }) });
        }),
    );
    const restored = pastedFile({ file_id: 'restored-file', file: undefined });
    const editor = renderEditor();
    let moved: Promise<void> = Promise.resolve();
    await act(async () => {
      moved = editor.result.current.moveInline(restored);
    });
    /** A second new chat: same conversation id, new unsaved-chat identity. */
    mockState.draftToken = Symbol('new-conversation-draft');
    await act(async () => {
      editor.rerender({
        files: new Map<string, ExtendedFile>([['restored-file', restored]]),
      });
    });

    await act(async () => {
      releaseDownload('recovered from storage');
      await moved;
    });

    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  it('aborts a move when the message was sent while the text resolved', async () => {
    let releaseDownload: (text: string) => void = () => undefined;
    mockFileDownload.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseDownload = (text: string) =>
            resolve({ data: new Blob([text], { type: 'text/plain' }) });
        }),
    );
    const restored = pastedFile({ file_id: 'restored-file', file: undefined });
    const editor = renderEditor();
    let moved: Promise<void> = Promise.resolve();
    await act(async () => {
      moved = editor.result.current.moveInline(restored);
    });
    /** Sending clears the composer's files without changing either conversation identity. */
    await act(async () => {
      editor.rerender({ files: new Map<string, ExtendedFile>() });
    });

    await act(async () => {
      releaseDownload('recovered from storage');
      await moved;
    });

    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  it('does not open an editor for an attachment a send already took', async () => {
    let releaseDownload: (text: string) => void = () => undefined;
    mockFileDownload.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseDownload = (text: string) =>
            resolve({ data: new Blob([text], { type: 'text/plain' }) });
        }),
    );
    const restored = pastedFile({ file_id: 'restored-file', file: undefined });
    const editor = renderEditor();
    let opened: Promise<void> = Promise.resolve();
    await act(async () => {
      opened = editor.result.current.openEditor(restored);
    });
    /** Sending clears the composer's files without changing either conversation identity. */
    await act(async () => {
      editor.rerender({ files: new Map<string, ExtendedFile>() });
    });

    await act(async () => {
      releaseDownload('recovered from storage');
      await opened;
    });

    expect(editor.result.current.editing).toBeNull();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('detaches through a restored entry keyed by its temporary upload id', async () => {
    /** Draft restoration keys the map by the temporary id while the value carries the
     * server-assigned one; membership must match either identity. */
    const restored = pastedFile({ file_id: 'server-id', temp_file_id: 'temp-key' });
    const editor = renderEditor(new Map([['temp-key', restored]]));

    await act(async () => {
      await editor.result.current.openEditor(restored);
    });
    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });
    await act(async () => {
      capturedLifecycle?.onSuccess?.('replacement-file');
    });

    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
  });

  it('abandons the queued replacement when its composer is gone by commit time', async () => {
    /** The upload queue holds the batch open until this gate is pulled, standing in for the
     * config wait that keeps a real batch queued across a navigation. */
    let commitQueue: (accepted: boolean) => void = () => undefined;
    mockRouteFiles.mockImplementation(
      (_files: unknown, _toolResource: unknown, lifecycle: UploadLifecycleCallbacks) =>
        new Promise<boolean>((resolve) => {
          commitQueue = (accepted) => resolve(accepted && lifecycle.shouldCommit?.() !== false);
        }),
    );
    const editor = await openEditor();

    let save: Promise<void> = Promise.resolve();
    await act(async () => {
      save = editor.result.current.saveEdit('corrected');
    });
    mockState.conversation = {
      conversationId: 'conversation-b',
      endpoint: 'openAI',
    } as TConversation;
    await act(async () => {
      editor.rerender({ files: new Map<string, ExtendedFile>() });
    });

    expect(mockRouteFiles).toHaveBeenCalledTimes(1);
    await act(async () => {
      commitQueue(true);
      await save;
    });

    expect(await mockRouteFiles.mock.results[0].value).toBe(false);
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('retires the editor when the conversation changes under it', async () => {
    const editor = await openEditor();
    expect(editor.result.current.editing).not.toBeNull();

    mockState.conversation = {
      conversationId: 'conversation-b',
      endpoint: 'openAI',
    } as TConversation;
    await act(async () => {
      editor.rerender({ files: new Map<string, ExtendedFile>() });
    });

    expect(editor.result.current.editing).toBeNull();
  });

  it('retires the editor when a new chat resets the unsaved-chat identity', async () => {
    const editor = await openEditor();
    expect(editor.result.current.editing).not.toBeNull();

    mockState.draftToken = Symbol('new-conversation-draft');
    await act(async () => {
      editor.rerender({ files: new Map<string, ExtendedFile>() });
    });

    expect(editor.result.current.editing).toBeNull();
  });

  it('refuses a save from a different conversation than the one the edit opened in', async () => {
    const editor = await openEditor();

    mockState.conversation = {
      conversationId: 'conversation-b',
      endpoint: 'openAI',
    } as TConversation;
    await act(async () => {
      editor.rerender({ files: new Map<string, ExtendedFile>() });
    });
    await act(async () => {
      await editor.result.current.saveEdit('corrected');
    });

    expect(mockRouteFiles).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('resolves restored text by downloading the stored bytes', async () => {
    mockFileDownload.mockResolvedValue({
      data: new Blob(['recovered from storage'], { type: 'text/plain' }),
    });
    const restored = pastedFile({ file: undefined, file_id: 'restored-file' });

    const editor = renderEditor();
    await act(async () => {
      await editor.result.current.openEditor(restored);
    });

    expect(mockFileDownload).toHaveBeenCalledWith('user-1', 'restored-file');
    expect(editor.result.current.editing?.text).toBe('recovered from storage');
  });

  it('reports the text unavailable when every source comes back empty', async () => {
    mockFileDownload.mockRejectedValue(new Error('gone'));
    const restored = pastedFile({ file: undefined, file_id: 'restored-file' });

    const editor = renderEditor();
    await act(async () => {
      await editor.result.current.openEditor(restored);
    });

    expect(editor.result.current.editing).toBeNull();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_pasted_text_unavailable' }),
    );
  });
});
