import { ContentTypes } from 'librechat-data-provider';
import { renderHook, act } from '@testing-library/react';
import type { TMessage, TSubmission } from 'librechat-data-provider';
import useCompactConversation from '../useCompactConversation';

const mockAsk = jest.fn();
let mockContext: {
  index: number;
  isSubmitting: boolean;
  conversation: { conversationId: string; endpoint: string } | null;
};
let mockLatestMessage: TMessage | null;
let mockSubmission: TSubmission | null;

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ ...mockContext, ask: mockAsk }),
}));
jest.mock('~/hooks/Messages/useLatestMessage', () => ({
  useLatestMessage: () => mockLatestMessage,
}));
jest.mock('recoil', () => ({
  useRecoilValue: () => mockSubmission,
}));
jest.mock('~/store', () => ({
  __esModule: true,
  default: { submissionByIndex: () => 'submission' },
}));

const leaf = (overrides: Partial<TMessage> = {}): TMessage =>
  ({
    messageId: 'a1',
    parentMessageId: 'u1',
    conversationId: 'convo-1',
    isCreatedByUser: false,
    text: 'answer',
    ...overrides,
  }) as TMessage;

describe('useCompactConversation', () => {
  beforeEach(() => {
    mockAsk.mockClear();
    mockContext = {
      index: 0,
      isSubmitting: false,
      conversation: { conversationId: 'convo-1', endpoint: 'openAI' },
    };
    mockLatestMessage = leaf();
    mockSubmission = null;
  });

  it('submits a compaction hung off the branch leaf', () => {
    const { result } = renderHook(() => useCompactConversation());

    expect(result.current.canCompact).toBe(true);
    act(() => result.current.compact());

    expect(mockAsk).toHaveBeenCalledWith(
      { text: '', conversationId: 'convo-1', messageId: 'a1', parentMessageId: 'u1' },
      { compact: true },
    );
  });

  it.each([
    [
      'a new conversation',
      () => (mockContext.conversation = { conversationId: 'new', endpoint: 'openAI' }),
    ],
    ['a submission in flight', () => (mockContext.isSubmitting = true)],
    ['no leaf', () => (mockLatestMessage = null)],
    [
      'a leaf that is already a bare summary',
      () =>
        (mockLatestMessage = leaf({
          text: '',
          content: [
            { type: ContentTypes.SUMMARY, content: [{ type: ContentTypes.TEXT, text: 's' }] },
          ],
        })),
    ],
  ])('cannot compact with %s', (_label, arrange) => {
    arrange();
    const { result } = renderHook(() => useCompactConversation());

    expect(result.current.canCompact).toBe(false);
    act(() => result.current.compact());
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it('reports compacting only for its own submission', () => {
    mockContext.isSubmitting = true;
    mockSubmission = { compact: true } as TSubmission;
    expect(renderHook(() => useCompactConversation()).result.current.isCompacting).toBe(true);

    mockSubmission = { compact: undefined } as TSubmission;
    expect(renderHook(() => useCompactConversation()).result.current.isCompacting).toBe(false);
  });
});
