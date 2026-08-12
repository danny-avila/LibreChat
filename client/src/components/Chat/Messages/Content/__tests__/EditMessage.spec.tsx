import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function renderEditor({ enterEdit = jest.fn(), ask = jest.fn() } = {}) {
  render(
    <EditMessage
      text={message.text}
      message={message}
      isSubmitting={false}
      ask={ask}
      enterEdit={enterEdit}
      siblingIdx={0}
      setSiblingIdx={jest.fn()}
    />,
  );
  return { ask, enterEdit };
}

describe('EditMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMessages.mockReturnValue([message]);
    mockMutateAsync.mockResolvedValue({});
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
});
