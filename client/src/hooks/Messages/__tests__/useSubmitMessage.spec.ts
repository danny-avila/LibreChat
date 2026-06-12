import { act, renderHook } from '@testing-library/react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { useAuthContext } from '~/hooks/AuthContext';
import useSubmitMessage from '../useSubmitMessage';

const mockSetActivePrompt = jest.fn();

jest.mock('recoil', () => ({
  useRecoilValue: jest.fn(),
  useSetRecoilState: jest.fn(),
}));

jest.mock('librechat-data-provider', () => ({
  replaceSpecialVars: jest.fn(({ text }) => text),
}));

jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
  useChatFormContext: jest.fn(),
  useAddedChatContext: jest.fn(),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('~/hooks/Messages/useLatestMessage', () => ({
  useLatestMessage: jest.fn(),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    autoSendPrompts: 'autoSendPrompts',
    activePromptByIndex: jest.fn(() => 'activePromptByIndex'),
  },
}));

const mockUseRecoilValue = useRecoilValue as jest.Mock;
const mockUseSetRecoilState = useSetRecoilState as jest.Mock;
const mockUseChatContext = useChatContext as jest.Mock;
const mockUseChatFormContext = useChatFormContext as jest.Mock;
const mockUseAddedChatContext = useAddedChatContext as jest.Mock;
const mockUseAuthContext = useAuthContext as jest.Mock;
const mockUseLatestMessage = useLatestMessage as jest.Mock;

describe('useSubmitMessage', () => {
  const ask = jest.fn();
  const reset = jest.fn();
  const setMessages = jest.fn();
  const getMessages = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRecoilValue.mockReturnValue(false);
    mockUseSetRecoilState.mockReturnValue(mockSetActivePrompt);
    mockUseAuthContext.mockReturnValue({ user: { id: 'user-1' } });
    mockUseAddedChatContext.mockReturnValue({ conversation: null });
    mockUseChatFormContext.mockReturnValue({ reset, getValues: jest.fn(() => '') });
    mockUseLatestMessage.mockReturnValue({ messageId: 'assistant-message' });
    getMessages.mockReturnValue([{ messageId: 'assistant-message' }]);
    mockUseChatContext.mockReturnValue({
      ask,
      index: 0,
      getMessages,
      setMessages,
    });
  });

  it('propagates blocked submits so direct callers can preserve their text', () => {
    ask.mockReturnValue(false);

    const { result } = renderHook(() => useSubmitMessage());

    let submitted: false | void = undefined;
    act(() => {
      submitted = result.current.submitMessage({ text: 'dictated follow-up' });
    });

    expect(submitted).toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });
});
