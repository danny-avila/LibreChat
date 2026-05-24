import { renderHook, waitFor } from '@testing-library/react';
import type { TConversation, TMessage } from 'librechat-data-provider';
import useResumeOnLoad from '~/hooks/SSE/useResumeOnLoad';

const mockSetSubmission = jest.fn();
const mockSetLatestMessage = jest.fn();
const mockUseStreamStatus = jest.fn();

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useSetRecoilState: jest.fn((atom: string) => {
    if (atom === 'latestMessageFamily-2') {
      return mockSetLatestMessage;
    }

    return mockSetSubmission;
  }),
  useRecoilValue: jest.fn((atom: string) => {
    if (atom === 'conversationByIndex-2') {
      return { endpoint: 'openAI' } as TConversation;
    }

    return null;
  }),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    submissionByIndex: jest.fn((index: number) => `submissionByIndex-${index}`),
    conversationByIndex: jest.fn((index: number) => `conversationByIndex-${index}`),
    latestMessageFamily: jest.fn((index: number) => `latestMessageFamily-${index}`),
  },
}));

jest.mock('~/data-provider', () => ({
  useStreamStatus: (...args: unknown[]) => mockUseStreamStatus(...args),
}));

const CONVERSATION_ID = 'conversation-resume';

const userMessage = {
  messageId: 'user-message',
  parentMessageId: '00000000-0000-0000-0000-000000000000',
  conversationId: CONVERSATION_ID,
  text: 'continue this',
  isCreatedByUser: true,
} as TMessage;

const responseMessage = {
  messageId: 'assistant-message',
  parentMessageId: 'user-message',
  conversationId: CONVERSATION_ID,
  text: '',
  content: [{ type: 'text', text: 'stale content' }],
  isCreatedByUser: false,
} as TMessage;

describe('useResumeOnLoad latest-message seed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStreamStatus.mockReturnValue({
      data: {
        active: true,
        streamId: 'stream-resume',
        status: 'active',
        resumeState: {
          userMessage,
          responseMessageId: responseMessage.messageId,
          aggregatedContent: [{ type: 'text', text: 'fresh resumed content' }],
        },
      },
      isSuccess: true,
      isFetching: false,
    });
  });

  it('builds the resume submission without seeding latestMessage before streaming is active', async () => {
    const getMessages = jest.fn(() => [userMessage, responseMessage]);

    renderHook(() => useResumeOnLoad(CONVERSATION_ID, getMessages, 2, true));

    await waitFor(() => {
      expect(mockSetSubmission).toHaveBeenCalledTimes(1);
    });

    const submission = mockSetSubmission.mock.calls[0][0];

    expect(submission.initialResponse).toEqual(
      expect.objectContaining({
        messageId: responseMessage.messageId,
        parentMessageId: responseMessage.parentMessageId,
        conversationId: CONVERSATION_ID,
        content: [{ type: 'text', text: 'fresh resumed content' }],
        isCreatedByUser: false,
      }),
    );
    expect(mockSetLatestMessage).not.toHaveBeenCalled();
  });
});
