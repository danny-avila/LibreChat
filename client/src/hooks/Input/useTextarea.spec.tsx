import { EToolResources } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';

const mockForceResize = jest.fn();
const mockInsertTextAtCursor = jest.fn();
const mockResolvePastedTextFile = jest.fn();
const mockRouteFiles = jest.fn();
const mockGetUploadOptions = jest.fn(() => [EToolResources.context]);
const mockSetFilesLoading = jest.fn();
const mockShowToast = jest.fn();
const mockOpenModal = jest.fn();
const mockLocalize = jest.fn((key: string) => key);
const mockSetActivePrompt = jest.fn();

let useTextarea: typeof import('./useTextarea').default;
let mockConversation: { endpoint: string; conversationId?: string } = {
  endpoint: 'openAI',
  conversationId: 'convo-1',
};

jest.mock('~/utils', () => ({
  forceResize: mockForceResize,
  insertTextAtCursor: mockInsertTextAtCursor,
  resolvePastedTextFile: mockResolvePastedTextFile,
  getEntityName: jest.fn(() => ''),
  getEntity: jest.fn(() => ({ entity: undefined, isAgent: false, isAssistant: false })),
  checkIfScrollable: jest.fn(() => false),
}));

jest.mock('recoil', () => ({
  useRecoilValue: jest.fn(() => true),
  useRecoilState: jest.fn(() => [undefined, mockSetActivePrompt]),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: jest.fn(() => ({ showToast: mockShowToast })),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    enterToSend: { key: 'enterToSend' },
    pasteLongTextAsFile: { key: 'pasteLongTextAsFile' },
    activePromptByIndex: jest.fn(() => ({ key: 'activePrompt' })),
  },
}));

jest.mock('~/Providers/AssistantsMapContext', () => ({
  useAssistantsMapContext: jest.fn(() => ({})),
}));

jest.mock('~/hooks/Messages/useLatestMessage', () => ({
  useLatestMessageMeta: jest.fn(() => undefined),
}));

jest.mock('~/hooks/Input/useComposerBindings', () => ({
  __esModule: true,
  default: jest.fn(() => ({ submitOverride: undefined, yieldedChords: undefined })),
}));

jest.mock('~/hooks/Files/useFileUploadRouter', () => ({
  __esModule: true,
  default: jest.fn(() => mockRouteFiles),
}));

jest.mock('~/Providers/AgentsMapContext', () => ({
  useAgentsMapContext: jest.fn(() => ({})),
}));

jest.mock('~/hooks/Conversations/useGetSender', () => ({
  __esModule: true,
  default: jest.fn(() => jest.fn(() => 'Assistant')),
}));

jest.mock('~/hooks/Files/useUploadOptions', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    getOptions: mockGetUploadOptions,
    uploadsDisabled: false,
  })),
}));

jest.mock('~/data-provider', () => ({
  useInteractionHealthCheck: jest.fn(() => jest.fn(async () => true)),
}));

jest.mock('~/Providers/ChatContext', () => ({
  useChatContext: jest.fn(() => ({
    index: 0,
    conversation: mockConversation,
    isSubmitting: false,
    files: new Map(),
    setFilesLoading: mockSetFilesLoading,
  })),
}));

jest.mock('~/Providers', () => ({
  useUploadModalContext: jest.fn(() => ({ openModal: mockOpenModal })),
}));

jest.mock('~/utils/shortcuts', () => ({
  resolveComposerKeyDown: jest.fn(),
}));

jest.mock('~/common', () => ({ globalAudioId: 'global-audio' }));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(() => mockLocalize),
}));

const pastedText = 'a'.repeat(2501);

beforeAll(async () => {
  useTextarea = (await import('./useTextarea')).default;
});

const createPasteEvent = (files: File[] = []) => ({
  clipboardData: {
    files,
    getData: jest.fn(() => pastedText),
  },
  preventDefault: jest.fn(),
});

const renderTextareaHook = (answerModeActive = false) => {
  const textArea = document.createElement('textarea');
  const submitButton = document.createElement('button');
  const setIsScrollable = jest.fn();
  const hook = renderHook(() =>
    useTextarea({
      textAreaRef: { current: textArea },
      submitButtonRef: { current: submitButton },
      setIsScrollable,
      answerModeActive,
    }),
  );

  return { ...hook, textArea };
};

describe('useTextarea long-paste fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConversation = { endpoint: 'openAI', conversationId: 'convo-1' };
    mockGetUploadOptions.mockReturnValue([EToolResources.context]);
    mockResolvePastedTextFile.mockImplementation((text: string) => ({
      file: new File([text], 'pasted-text.txt', { type: 'text/plain' }),
      toolResource: EToolResources.context,
    }));
  });

  it('keeps long pasted text inline while the composer is the answer box', () => {
    const { result } = renderTextareaHook(true);
    const event = createPasteEvent();

    act(() =>
      result.current.handlePaste(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>),
    );

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mockResolvePastedTextFile).not.toHaveBeenCalled();
    expect(mockRouteFiles).not.toHaveBeenCalled();
  });

  it('restores the paste when attachment validation rejects the file', async () => {
    mockRouteFiles.mockResolvedValueOnce(false);
    const { result, textArea } = renderTextareaHook();
    textArea.value = 'before selected after';
    textArea.setSelectionRange(7, 15);
    mockInsertTextAtCursor.mockImplementationOnce((element: HTMLTextAreaElement, text: string) => {
      element.setRangeText(text, element.selectionStart, element.selectionEnd, 'end');
    });
    const event = createPasteEvent();

    act(() =>
      result.current.handlePaste(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>),
    );

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockInsertTextAtCursor).toHaveBeenCalledTimes(1));
    expect(mockInsertTextAtCursor).toHaveBeenCalledWith(textArea, pastedText);
    expect(textArea.value).toBe(`before ${pastedText} after`);
    expect(mockForceResize).toHaveBeenCalledWith(textArea);
  });

  it('does not restore the paste when the attachment is accepted', async () => {
    mockRouteFiles.mockResolvedValueOnce(true);
    const { result } = renderTextareaHook();
    const event = createPasteEvent();

    act(() =>
      result.current.handlePaste(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>),
    );

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'com_ui_file_attached_as_text',
        status: 'info',
      }),
    );
    expect(mockInsertTextAtCursor).not.toHaveBeenCalled();
    expect(mockForceResize).not.toHaveBeenCalled();
  });

  it('replaces selected draft text when the attachment is accepted', async () => {
    mockRouteFiles.mockResolvedValueOnce(true);
    const { result, textArea } = renderTextareaHook();
    const inputListener = jest.fn();
    textArea.value = 'before selected after';
    textArea.setSelectionRange(7, 15);
    textArea.addEventListener('input', inputListener);
    const event = createPasteEvent();

    act(() =>
      result.current.handlePaste(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>),
    );

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(textArea.value).toBe('before  after');
    expect(textArea.selectionStart).toBe(7);
    expect(textArea.selectionEnd).toBe(7);
    expect(inputListener).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockRouteFiles).toHaveBeenCalledTimes(1));
    expect(mockInsertTextAtCursor).not.toHaveBeenCalled();
  });

  it('restores the paste after an upload failure when the composer is unchanged', async () => {
    let onUploadError: (() => void) | undefined;
    mockRouteFiles.mockImplementationOnce(
      (_files: File[], _toolResource: EToolResources, callback?: () => void) => {
        onUploadError = callback;
        return Promise.resolve(true);
      },
    );
    const { result, textArea } = renderTextareaHook();
    textArea.value = 'before selected after';
    textArea.setSelectionRange(7, 15);
    const event = createPasteEvent();

    act(() =>
      result.current.handlePaste(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>),
    );

    await waitFor(() => expect(onUploadError).toBeDefined());
    expect(textArea.value).toBe('before  after');
    expect(mockInsertTextAtCursor).not.toHaveBeenCalled();

    act(() => onUploadError?.());

    expect(mockInsertTextAtCursor).toHaveBeenCalledWith(textArea, pastedText);
    expect(mockForceResize).toHaveBeenCalledWith(textArea);
  });

  it('skips upload-failure recovery when the conversation changed', async () => {
    let onUploadError: (() => void) | undefined;
    mockRouteFiles.mockImplementationOnce(
      (_files: File[], _toolResource: EToolResources, callback?: () => void) => {
        onUploadError = callback;
        return Promise.resolve(true);
      },
    );
    const { result, rerender } = renderTextareaHook();
    const event = createPasteEvent();

    act(() =>
      result.current.handlePaste(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>),
    );

    await waitFor(() => expect(onUploadError).toBeDefined());
    mockConversation = { endpoint: 'openAI', conversationId: 'convo-2' };
    rerender();

    act(() => onUploadError?.());

    expect(mockInsertTextAtCursor).not.toHaveBeenCalled();
    expect(mockForceResize).not.toHaveBeenCalled();
  });

  it('skips upload-failure recovery when the composer content changed', async () => {
    let onUploadError: (() => void) | undefined;
    mockRouteFiles.mockImplementationOnce(
      (_files: File[], _toolResource: EToolResources, callback?: () => void) => {
        onUploadError = callback;
        return Promise.resolve(true);
      },
    );
    const { result, textArea } = renderTextareaHook();
    textArea.value = 'draft at paste time';
    const event = createPasteEvent();

    act(() =>
      result.current.handlePaste(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>),
    );

    await waitFor(() => expect(onUploadError).toBeDefined());
    textArea.value = 'draft after more typing';

    act(() => onUploadError?.());

    expect(mockInsertTextAtCursor).not.toHaveBeenCalled();
    expect(mockForceResize).not.toHaveBeenCalled();
  });

  it('forwards upload recovery through the assistants route', async () => {
    mockConversation = { endpoint: 'assistants' };
    let onUploadError: (() => void) | undefined;
    mockRouteFiles.mockImplementationOnce(
      (_files: File[], _toolResource: EToolResources | undefined, callback?: () => void) => {
        onUploadError = callback;
        return Promise.resolve(true);
      },
    );
    const { result, textArea } = renderTextareaHook();
    const event = createPasteEvent();

    act(() =>
      result.current.handlePaste(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>),
    );

    await waitFor(() => expect(onUploadError).toBeDefined());
    expect(mockRouteFiles).toHaveBeenCalledWith(expect.any(Array), undefined, onUploadError);

    act(() => onUploadError?.());

    expect(mockInsertTextAtCursor).toHaveBeenCalledWith(textArea, pastedText);
    expect(mockForceResize).toHaveBeenCalledWith(textArea);
  });

  it('restores the paste when attachment routing rejects unexpectedly', async () => {
    const error = new Error('upload failed');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRouteFiles.mockRejectedValueOnce(error);
    const { result, textArea } = renderTextareaHook();
    const event = createPasteEvent();

    act(() =>
      result.current.handlePaste(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>),
    );

    await waitFor(() => expect(mockInsertTextAtCursor).toHaveBeenCalledTimes(1));
    expect(mockInsertTextAtCursor).toHaveBeenCalledWith(textArea, pastedText);
    expect(mockForceResize).toHaveBeenCalledWith(textArea);
    expect(consoleError).toHaveBeenCalledWith('clipboard file routing error', error);
    consoleError.mockRestore();
  });

  it('clears the loading state when clipboard file routing rejects unexpectedly', async () => {
    const error = new Error('upload failed');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRouteFiles.mockRejectedValueOnce(error);
    const { result } = renderTextareaHook();
    const event = createPasteEvent([new File(['file'], 'notes.txt', { type: 'text/plain' })]);

    act(() =>
      result.current.handlePaste(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>),
    );

    await waitFor(() => expect(mockSetFilesLoading).toHaveBeenLastCalledWith(false));
    expect(consoleError).toHaveBeenCalledWith('clipboard file routing error', error);
    expect(mockInsertTextAtCursor).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
