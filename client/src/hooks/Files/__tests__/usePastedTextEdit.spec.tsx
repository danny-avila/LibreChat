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
import type { ExtendedFile } from '~/common';

const mockShowToast = jest.fn();
const mockSetValue = jest.fn();
const mockDeleteFile = jest.fn();
const mockDeleteFiles = jest.fn();
const mockRouteFiles = jest.fn();
const mockFileDownload = jest.fn();

/** Values the module-level mocks read, so each test can stage its own scenario. */
const mockState = {
  conversation: { conversationId: 'conversation-a', endpoint: 'openAI' } as TConversation,
  draftToken: Symbol('new-conversation-draft'),
  fileList: [] as TFile[],
};

type TFile = { file_id: string; text?: string };

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ conversation: mockState.conversation }),
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
    mockState.fileList = [];
    mockRouteFiles.mockImplementation(
      (_files: unknown, _toolResource: unknown, lifecycle: UploadLifecycleCallbacks) => {
        capturedLifecycle = lifecycle;
        return Promise.resolve(true);
      },
    );
  });

  const renderEditor = () =>
    renderHook(
      ({ files }) =>
        usePastedTextEdit({ files, setFiles: jest.fn(), textAreaRef: { current: null } }),
      {
        initialProps: { files: new Map<string, ExtendedFile>([['pasted-file', pastedFile()]]) },
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
