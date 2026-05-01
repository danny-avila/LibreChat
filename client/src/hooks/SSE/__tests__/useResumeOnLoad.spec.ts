import { renderHook } from '@testing-library/react';
import { Constants } from 'librechat-data-provider';
import type { TConversation, TMessage, TSubmission } from 'librechat-data-provider';

const mockSetSubmission = jest.fn();
const mockUseStreamStatus = jest.fn();
let mockUseRecoilValueCallIndex = 0;

let mockCurrentSubmission: TSubmission | null = null;
let mockCurrentConversation: TConversation | null = {
  conversationId: 'conv-123',
  endpoint: 'openAI',
} as TConversation;

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useSetRecoilState: () => mockSetSubmission,
  useRecoilValue: jest.fn(() => {
    const callIndex = mockUseRecoilValueCallIndex++;
    return callIndex % 2 === 0 ? mockCurrentSubmission : mockCurrentConversation;
  }),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    submissionByIndex: jest.fn(),
    conversationByIndex: jest.fn(),
  },
}));

jest.mock('~/data-provider', () => ({
  useStreamStatus: (...args: unknown[]) => mockUseStreamStatus(...args),
}));

import useResumeOnLoad from '~/hooks/SSE/useResumeOnLoad';

const buildSubmission = (conversationId = 'conv-123'): TSubmission =>
  ({
    conversation: { conversationId, endpoint: 'openAI' },
    userMessage: {
      messageId: 'user-1',
      conversationId,
      text: 'hello',
      isCreatedByUser: true,
    },
    messages: [],
    initialResponse: {
      messageId: 'response-1',
      conversationId,
      text: '',
      isCreatedByUser: false,
    },
    endpointOption: {},
  }) as TSubmission;

describe('useResumeOnLoad', () => {
  beforeEach(() => {
    mockSetSubmission.mockClear();
    mockUseStreamStatus.mockClear();
    mockUseRecoilValueCallIndex = 0;
    mockCurrentSubmission = null;
    mockCurrentConversation = {
      conversationId: 'conv-123',
      endpoint: 'openAI',
    } as TConversation;
    mockUseStreamStatus.mockReturnValue({
      data: { active: false },
      isSuccess: true,
      isFetching: false,
    });
  });

  it('rechecks stream status in the same conversation after the active submission clears', () => {
    mockCurrentSubmission = buildSubmission();

    const { rerender } = renderHook(() =>
      useResumeOnLoad('conv-123', () => [] as TMessage[], 0, true),
    );

    expect(mockUseStreamStatus).toHaveBeenLastCalledWith('conv-123', false);

    mockUseRecoilValueCallIndex = 0;
    mockCurrentSubmission = null;
    rerender();

    expect(mockUseStreamStatus).toHaveBeenLastCalledWith('conv-123', true);
  });

  it('creates a resume submission when stream status reports an active job', () => {
    mockUseStreamStatus.mockReturnValue({
      data: {
        active: true,
        streamId: 'conv-123',
        status: 'running',
        resumeState: {
          userMessage: {
            messageId: 'user-1',
            conversationId: 'conv-123',
            text: 'hello',
            parentMessageId: Constants.NO_PARENT,
          },
          responseMessageId: 'response-1',
          aggregatedContent: [{ type: 'text', text: 'partial answer' }],
          runSteps: [],
        },
      },
      isSuccess: true,
      isFetching: false,
    });

    renderHook(() => useResumeOnLoad('conv-123', () => [] as TMessage[], 0, true));

    expect(mockSetSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeStreamId: 'conv-123',
        initialResponse: expect.objectContaining({
          messageId: 'response-1',
          content: [{ type: 'text', text: 'partial answer' }],
        }),
      }),
    );
  });
});
