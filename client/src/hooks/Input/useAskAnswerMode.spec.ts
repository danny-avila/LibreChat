jest.mock('~/data-provider', () => ({ useGetMessagesByConvoId: jest.fn() }));
jest.mock('~/components/Chat/Messages/Content/ApprovalContext', () => ({
  useAskSubmitStatus: () => ({ getAskStatus: () => 'idle' }),
  useResumeSubmit: () => ({ submitAskAnswer: jest.fn() }),
}));
jest.mock('~/Providers', () => ({ useOptionalChatFormContext: () => undefined }));
jest.mock('~/utils', () => ({ getAskAnswerDraftId: (id: string) => `draft-${id}` }));
jest.mock('recoil', () => ({
  atom: (cfg: unknown) => cfg,
  useRecoilState: () => [[], jest.fn()],
  useRecoilValue: () => false,
}));
jest.mock('~/store', () => ({ __esModule: true, default: { saveDrafts: 'saveDrafts' } }));

import { renderHook } from '@testing-library/react';
import { useGetMessagesByConvoId } from '~/data-provider';
import { findLiveAskUserQuestion } from '~/utils/approval';
import useAskAnswerMode from './useAskAnswerMode';

const mockUseGetMessages = useGetMessagesByConvoId as jest.Mock;

const liveAsk = {
  actionId: 'a1',
  question: { question: 'Pick one', options: [], multiSelect: false },
} as unknown as ReturnType<typeof findLiveAskUserQuestion>;

describe('useAskAnswerMode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('projects the live ask via the findLiveAskUserQuestion select over the conversation cache', () => {
    mockUseGetMessages.mockReturnValue({ data: liveAsk });

    const { result } = renderHook(() => useAskAnswerMode('conversation-1'));

    expect(mockUseGetMessages).toHaveBeenCalledWith(
      'conversation-1',
      expect.objectContaining({ enabled: true, select: findLiveAskUserQuestion }),
    );
    expect(result.current.liveAsk).toBe(liveAsk);
    expect(result.current.active).toBe(true);
    expect(result.current.popoverVisible).toBe(true);
  });

  it('is inactive when the select finds no live ask', () => {
    mockUseGetMessages.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useAskAnswerMode('conversation-1'));

    expect(result.current.liveAsk).toBeNull();
    expect(result.current.active).toBe(false);
    expect(result.current.popoverVisible).toBe(false);
  });

  it('disables the query and forces liveAsk null for a new (unsaved) conversation', () => {
    mockUseGetMessages.mockReturnValue({ data: liveAsk });

    const { result } = renderHook(() => useAskAnswerMode('new'));

    expect(mockUseGetMessages).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ enabled: false }),
    );
    expect(result.current.liveAsk).toBeNull();
    expect(result.current.active).toBe(false);
  });

  it('forces liveAsk null when there is no conversation id', () => {
    mockUseGetMessages.mockReturnValue({ data: liveAsk });

    const { result } = renderHook(() => useAskAnswerMode(null));

    expect(result.current.liveAsk).toBeNull();
  });
});
