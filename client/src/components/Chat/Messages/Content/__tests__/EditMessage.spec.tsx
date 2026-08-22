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
    await user.click(screen.getByRole('button', { name: 'com_ui_update_rerun' }));

    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(screen.getByTestId('message-text-editor')).toHaveValue('Refused answer edit');
    expect(setSiblingIdx).not.toHaveBeenCalled();
    expect(enterEdit).not.toHaveBeenCalled();
  });
});
