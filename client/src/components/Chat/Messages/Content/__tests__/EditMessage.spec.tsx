import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';
import EditMessage from '../EditMessage';

const mockMutateAsync = jest.fn();
const mockSetMessages = jest.fn();
const mockGetMessages = jest.fn();

jest.mock('recoil', () => ({
  useRecoilValue: () => 'ltr',
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { chatDirection: {} },
}));

jest.mock('librechat-data-provider/react-query', () => ({
  useUpdateMessageMutation: () => ({
    mutateAsync: mockMutateAsync,
    isLoading: false,
  }),
}));

jest.mock('~/Providers', () => ({
  useMessagesConversation: () => ({
    conversation: { conversationId: 'conversation-1', model: 'test-model' },
  }),
  useMessagesOperations: () => ({
    getMessages: mockGetMessages,
    setMessages: mockSetMessages,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/hooks/Chat', () => ({
  useGetAddedConvo: () => () => null,
}));

jest.mock('~/components/Chat/Input/Files/FileContainer', () => ({
  __esModule: true,
  default: ({ file, onDelete }: { file: { file_id?: string }; onDelete?: () => void }) =>
    onDelete ? (
      <button type="button" aria-label={`remove-${file.file_id}`} onClick={onDelete} />
    ) : null,
}));

jest.mock('../Container', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const message = {
  messageId: 'user-1',
  parentMessageId: 'root',
  conversationId: 'conversation-1',
  isCreatedByUser: true,
  text: 'Original message',
} as TMessage;

const assistantMessage = {
  messageId: 'assistant-1',
  parentMessageId: 'user-1',
  conversationId: 'conversation-1',
  isCreatedByUser: false,
  text: 'Original answer',
} as TMessage;

const emptyAssistantMessage = {
  messageId: 'assistant-2',
  parentMessageId: 'user-1',
  conversationId: 'conversation-1',
  isCreatedByUser: false,
  text: '',
} as TMessage;

function renderEditor({
  enterEdit = jest.fn(),
  ask = jest.fn(),
  setSiblingIdx = jest.fn(),
  editedMessage = message,
} = {}) {
  render(
    <EditMessage
      text={editedMessage.text}
      message={editedMessage}
      isSubmitting={false}
      ask={ask}
      enterEdit={enterEdit}
      siblingIdx={0}
      setSiblingIdx={setSiblingIdx}
    />,
  );
  return { ask, enterEdit, setSiblingIdx };
}

describe('EditMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMessages.mockReturnValue([message]);
    mockMutateAsync.mockResolvedValue({});
  });

  it('sizes the editor from the configured message font rather than pinning it', () => {
    renderEditor();

    const editor = screen.getByTestId('message-text-editor');
    expect(editor).toHaveClass('message-editor-text');
    expect(editor).not.toHaveClass('text-sm');
  });

  it('waits for a successful save before updating local state and closing', async () => {
    const user = userEvent.setup();
    const { enterEdit } = renderEditor();

    await user.clear(screen.getByTestId('message-text-editor'));
    await user.type(screen.getByTestId('message-text-editor'), 'Updated message');
    await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        conversationId: message.conversationId,
        model: 'test-model',
        text: 'Updated message',
        messageId: message.messageId,
      }),
    );
    expect(mockSetMessages).toHaveBeenCalledWith([
      expect.objectContaining({ messageId: message.messageId, text: 'Updated message' }),
    ]);
    expect(enterEdit).toHaveBeenCalledWith(true);
  });

  it('writes the save onto the thread as it stands when the request resolves', async () => {
    const user = userEvent.setup();
    const streamedAnswer = {
      messageId: 'assistant-streaming',
      parentMessageId: message.messageId,
      conversationId: 'conversation-1',
      isCreatedByUser: false,
      text: 'Half an answer',
    } as TMessage;

    /** The answer keeps streaming into the cache while the request is in flight. */
    mockMutateAsync.mockImplementation(async () => {
      mockGetMessages.mockReturnValue([message, streamedAnswer]);
      return {};
    });

    renderEditor();

    await user.clear(screen.getByTestId('message-text-editor'));
    await user.type(screen.getByTestId('message-text-editor'), 'Updated message');
    await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

    await waitFor(() => expect(mockSetMessages).toHaveBeenCalled());
    expect(mockSetMessages).toHaveBeenCalledWith([
      expect.objectContaining({ messageId: message.messageId, text: 'Updated message' }),
      expect.objectContaining({ messageId: streamedAnswer.messageId, text: 'Half an answer' }),
    ]);
  });

  it('keeps the editor open with the draft when saving fails', async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValue(new Error('Save failed'));
    const { enterEdit } = renderEditor();

    await user.clear(screen.getByTestId('message-text-editor'));
    await user.type(screen.getByTestId('message-text-editor'), 'Unsaved message');
    await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

    expect(await screen.findByText('com_ui_save_message_error')).toBeInTheDocument();
    expect(screen.getByTestId('message-text-editor')).toHaveValue('Unsaved message');
    expect(enterEdit).not.toHaveBeenCalled();
  });

  it('submits the edited user message with its original context', async () => {
    const user = userEvent.setup();
    const ask = jest.fn();
    const { enterEdit } = renderEditor({ ask });

    await user.clear(screen.getByTestId('message-text-editor'));
    await user.type(screen.getByTestId('message-text-editor'), 'Updated and rerun');
    await user.click(screen.getByRole('button', { name: 'com_ui_update_rerun' }));

    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Updated and rerun',
          parentMessageId: message.parentMessageId,
          conversationId: message.conversationId,
        }),
        expect.objectContaining({
          overrideFiles: message.files,
          overrideManualSkills: message.manualSkills,
          overrideQuotes: message.quotes,
        }),
      ),
    );
    expect(enterEdit).toHaveBeenCalledWith(true);
  });

  /** The rerun that matters most needs no edit at all: a cancelled response, or a
   *  backend restarted on different parameters, has to be reissued untouched. */
  it('reruns an unchanged request without needing a cosmetic edit first', async () => {
    const user = userEvent.setup();
    const ask = jest.fn();
    const { enterEdit, setSiblingIdx } = renderEditor({ ask });

    const rerun = screen.getByRole('button', { name: 'com_ui_rerun' });
    expect(rerun).toBeEnabled();
    /** Saving an untouched draft still has nothing to write. */
    expect(screen.getByRole('button', { name: 'com_ui_save' })).toBeDisabled();

    await user.click(rerun);

    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Original message',
          parentMessageId: message.parentMessageId,
          conversationId: message.conversationId,
        }),
        expect.objectContaining({ overrideFiles: message.files }),
      ),
    );
    expect(setSiblingIdx).toHaveBeenCalledWith(-1);
    expect(enterEdit).toHaveBeenCalledWith(true);
  });

  it('names the rerun after the edit only once the draft differs', async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByRole('button', { name: 'com_ui_rerun' })).toBeInTheDocument();

    await user.type(screen.getByTestId('message-text-editor'), ' again');

    expect(screen.queryByRole('button', { name: 'com_ui_rerun' })).toBeNull();
    expect(screen.getByRole('button', { name: 'com_ui_update_rerun' })).toBeEnabled();
  });

  it('reruns with an attachment removed without requiring a text edit', async () => {
    const user = userEvent.setup();
    const ask = jest.fn();
    const attachedMessage = {
      ...message,
      files: [
        {
          file_id: 'file-1',
          filename: 'Presentation.pdf',
          filepath: '/files/file-1',
          type: 'application/pdf',
        },
      ],
    } as TMessage;

    renderEditor({ ask, editedMessage: attachedMessage });

    await user.click(screen.getByRole('button', { name: 'remove-file-1' }));
    await user.click(screen.getByRole('button', { name: 'com_ui_update_rerun' }));

    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith(
        expect.objectContaining({ text: attachedMessage.text }),
        expect.objectContaining({ overrideFiles: [] }),
      ),
    );
  });

  it('saves an attachment removal and updates the local message', async () => {
    const user = userEvent.setup();
    const attachedMessage = {
      ...message,
      files: [
        {
          file_id: 'file-1',
          filename: 'Presentation.pdf',
          filepath: '/files/file-1',
          type: 'application/pdf',
        },
        {
          file_id: 'file-2',
          filename: 'Notes.txt',
          filepath: '/files/file-2',
          type: 'text/plain',
        },
      ],
    } as TMessage;
    const concurrentFile = {
      file_id: 'file-3',
      filename: 'Concurrent.txt',
      filepath: '/files/file-3',
      type: 'text/plain',
    };
    mockGetMessages.mockReturnValue([attachedMessage]);
    mockMutateAsync.mockImplementation(async () => {
      mockGetMessages.mockReturnValue([
        { ...attachedMessage, files: [...(attachedMessage.files ?? []), concurrentFile] },
      ]);
      return {};
    });

    renderEditor({ editedMessage: attachedMessage });

    await user.click(screen.getByRole('button', { name: 'remove-file-1' }));
    await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        conversationId: attachedMessage.conversationId,
        removedFileIds: ['file-1'],
        model: 'test-model',
        text: attachedMessage.text,
        messageId: attachedMessage.messageId,
      }),
    );
    expect(mockSetMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        messageId: attachedMessage.messageId,
        files: [
          expect.objectContaining({ file_id: 'file-2' }),
          expect.objectContaining({ file_id: 'file-3' }),
        ],
      }),
    ]);
  });

  it('keeps the editor open with the draft when a rerun is refused mid-stream', async () => {
    const user = userEvent.setup();
    const ask = jest.fn().mockReturnValue(false);
    const { enterEdit, setSiblingIdx } = renderEditor({ ask });

    await user.clear(screen.getByTestId('message-text-editor'));
    await user.type(screen.getByTestId('message-text-editor'), 'Refused rerun');
    await user.click(screen.getByRole('button', { name: 'com_ui_update_rerun' }));

    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(screen.getByTestId('message-text-editor')).toHaveValue('Refused rerun');
    expect(setSiblingIdx).not.toHaveBeenCalled();
    expect(enterEdit).not.toHaveBeenCalled();
  });

  it('keeps an assistant edit open when a refused rerun would discard it', async () => {
    const user = userEvent.setup();
    mockGetMessages.mockReturnValue([message, assistantMessage]);
    const ask = jest.fn().mockReturnValue(false);
    const { enterEdit, setSiblingIdx } = renderEditor({ ask, editedMessage: assistantMessage });

    await user.clear(screen.getByTestId('message-text-editor'));
    await user.type(screen.getByTestId('message-text-editor'), 'Refused answer edit');
    await user.click(screen.getByRole('button', { name: 'com_ui_rerun' }));

    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(screen.getByTestId('message-text-editor')).toHaveValue('Refused answer edit');
    expect(setSiblingIdx).not.toHaveBeenCalled();
    expect(enterEdit).not.toHaveBeenCalled();
  });

  /** An answer's draft never reaches the submission, so the button must not offer to
   *  update it, the status slot has to say the edit is about to be dropped, and the
   *  submission has to be the plain regeneration the hover action sends. */
  it('reruns an assistant response as a regeneration of that response', async () => {
    const user = userEvent.setup();
    mockGetMessages.mockReturnValue([message, assistantMessage]);
    const ask = jest.fn();
    const { enterEdit, setSiblingIdx } = renderEditor({ ask, editedMessage: assistantMessage });

    await user.clear(screen.getByTestId('message-text-editor'));
    await user.type(screen.getByTestId('message-text-editor'), 'An edited answer');

    expect(screen.queryByRole('button', { name: 'com_ui_update_rerun' })).toBeNull();
    expect(screen.getByText('com_ui_rerun_discards_changes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'com_ui_rerun' }));

    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: message.messageId }),
      expect.objectContaining({
        isRegenerate: true,
        /** Names this answer, so an older sibling's rerun cannot prune the newest
         *  answer's subtree out of the optimistic thread. */
        targetResponseMessageId: assistantMessage.messageId,
      }),
    );
    const [, options] = ask.mock.calls[0] as [unknown, Record<string, unknown>];
    /** Edit-resubmission options would replace this row in place instead. */
    expect(options).not.toHaveProperty('editedMessageId');
    expect(options).not.toHaveProperty('isEdited');
    expect(options).not.toHaveProperty('editedText');
    /** The new answer is a sibling of this one, not of the user turn. */
    expect(setSiblingIdx).not.toHaveBeenCalled();
    expect(enterEdit).toHaveBeenCalledWith(true);
  });

  /** A response cancelled before its first token is exactly what needs rerunning, and
   *  the form marks text required so Save cannot blank a message. Routing the rerun
   *  through that validation left the enabled button inert. */
  it('reruns an answer that was cancelled before any text arrived', async () => {
    const user = userEvent.setup();
    mockGetMessages.mockReturnValue([message, emptyAssistantMessage]);
    const ask = jest.fn();
    const { enterEdit } = renderEditor({ ask, editedMessage: emptyAssistantMessage });

    const rerun = screen.getByRole('button', { name: 'com_ui_rerun' });
    expect(rerun).toBeEnabled();
    await user.click(rerun);

    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: message.messageId }),
      expect.objectContaining({ targetResponseMessageId: emptyAssistantMessage.messageId }),
    );
    expect(enterEdit).toHaveBeenCalledWith(true);
  });
});
