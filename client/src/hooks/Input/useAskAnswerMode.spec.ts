const mockSubmitAskAnswer = jest.fn();
const mockResetComposer = jest.fn();
const mockGetComposerText = jest.fn(() => 'answer from A');
const mockSetComposerText = jest.fn();
const mockSetCollapsedIds = jest.fn();
const mockSetSelected = jest.fn();
const mockSetChecked = jest.fn();
const mockSetAnswerDraft = jest.fn();
const mockSetDraft = jest.fn();
let mockSaveDrafts = false;
let mockCollapsedIds: string[] = [];
let mockAnswerDraft = { actionId: null as string | null, text: '' };

jest.mock('~/data-provider', () => ({ useGetMessagesByConvoId: jest.fn() }));
jest.mock('~/components/Chat/Messages/Content/ApprovalContext', () => ({
  useAskSubmitStatus: () => ({ getAskStatus: () => 'idle' }),
  useResumeSubmit: () => ({ submitAskAnswer: mockSubmitAskAnswer }),
}));
jest.mock('~/Providers', () => ({
  useOptionalChatFormContext: () => ({
    reset: mockResetComposer,
    getValues: mockGetComposerText,
    setValue: mockSetComposerText,
  }),
}));
jest.mock('~/utils', () => ({
  getAskAnswerDraftId: (id: string) => `draft-${id}`,
  morphTransition: (update: () => void) => update(),
  setDraft: (...args: unknown[]) => mockSetDraft(...args),
}));
jest.mock('recoil', () => ({
  atom: (cfg: unknown) => cfg,
  useRecoilState: (state: { key?: string }) => {
    if (state.key === 'askAnswerModeCollapsedActions') {
      return [mockCollapsedIds, mockSetCollapsedIds];
    }
    if (state.key === 'askAnswerModeSelection') {
      return [null, mockSetSelected];
    }
    if (state.key === 'askAnswerModeChecked') {
      return [[], mockSetChecked];
    }
    if (state.key === 'askAnswerModeText') {
      return [mockAnswerDraft, mockSetAnswerDraft];
    }
    return [[], jest.fn()];
  },
  useRecoilValue: () => mockSaveDrafts,
}));
jest.mock('~/store', () => ({ __esModule: true, default: { saveDrafts: 'saveDrafts' } }));

import { act, renderHook } from '@testing-library/react';
import { useGetMessagesByConvoId } from '~/data-provider';
import { findLiveAskUserQuestion } from '~/utils/approval';
import useAskAnswerMode from './useAskAnswerMode';

const mockUseGetMessages = useGetMessagesByConvoId as jest.Mock;

const liveAsk = {
  actionId: 'a1',
  question: { question: 'Pick one', options: [], multiSelect: false },
} as unknown as ReturnType<typeof findLiveAskUserQuestion>;

describe('useAskAnswerMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveDrafts = false;
    mockCollapsedIds = [];
    mockAnswerDraft = { actionId: null, text: '' };
    mockGetComposerText.mockReturnValue('answer from A');
  });

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

  it('carries the composer answer into shared card state when collapsed', () => {
    mockUseGetMessages.mockReturnValue({ data: liveAsk });
    const { result } = renderHook(() => useAskAnswerMode('conversation-1'));

    act(() => result.current.collapse());

    expect(mockSetAnswerDraft).toHaveBeenCalledWith({
      actionId: 'a1',
      text: 'answer from A',
    });
  });

  it('restores the card answer into the composer when drafts are disabled', () => {
    mockCollapsedIds = ['a1'];
    mockAnswerDraft = { actionId: 'a1', text: 'answer edited in the card' };
    mockUseGetMessages.mockReturnValue({ data: liveAsk });
    const { result } = renderHook(() => useAskAnswerMode('conversation-1'));

    act(() => result.current.expand());

    expect(mockSetComposerText).toHaveBeenCalledWith('text', 'answer edited in the card');
  });

  it('keeps the ask-specific draft current while editing the card', () => {
    mockSaveDrafts = true;
    mockUseGetMessages.mockReturnValue({ data: liveAsk });
    const { result } = renderHook(() => useAskAnswerMode('conversation-1'));

    act(() => result.current.setAnswerText('answer edited in the card'));

    expect(mockSetAnswerDraft).toHaveBeenCalledWith({
      actionId: 'a1',
      text: 'answer edited in the card',
    });
    expect(mockSetDraft).toHaveBeenCalledWith({
      id: 'draft-a1',
      value: 'answer edited in the card',
    });
  });

  it('does not let a delayed answer success clear the composer or selection after navigation', () => {
    let finishAnswer: (() => void) | undefined;
    mockUseGetMessages.mockReturnValue({ data: liveAsk });
    mockSubmitAskAnswer.mockImplementation(
      (_actionId: string, _answer: string, options?: { onSuccess?: () => void }) => {
        finishAnswer = options?.onSuccess;
      },
    );
    const { result, rerender } = renderHook(
      ({ conversationId }) => useAskAnswerMode(conversationId),
      { initialProps: { conversationId: 'conversation-A' } },
    );

    expect(result.current.submitText('answer from A')).toBe(true);
    expect(mockSubmitAskAnswer).toHaveBeenCalledWith(
      'a1',
      'answer from A',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    const nextAsk = {
      ...liveAsk,
      actionId: 'b1',
    } as typeof liveAsk;
    mockUseGetMessages.mockReturnValue({ data: nextAsk });
    mockGetComposerText.mockReturnValue('draft typed in B');
    rerender({ conversationId: 'conversation-B' });
    mockSetSelected.mockClear();
    mockSetChecked.mockClear();

    finishAnswer?.();

    expect(mockResetComposer).not.toHaveBeenCalled();
    expect(mockSetSelected).not.toHaveBeenCalled();
    expect(mockSetChecked).not.toHaveBeenCalled();
  });

  it('keeps newer composer text when the answer settles on the same question', () => {
    let finishAnswer: (() => void) | undefined;
    mockUseGetMessages.mockReturnValue({ data: liveAsk });
    mockSubmitAskAnswer.mockImplementation(
      (_actionId: string, _answer: string, options?: { onSuccess?: () => void }) => {
        finishAnswer = options?.onSuccess;
      },
    );
    const { result } = renderHook(() => useAskAnswerMode('conversation-A'));

    expect(result.current.submitText('answer from A')).toBe(true);
    mockGetComposerText.mockReturnValue('new text typed while resuming');
    mockSetSelected.mockClear();
    mockSetChecked.mockClear();

    finishAnswer?.();

    expect(mockResetComposer).not.toHaveBeenCalled();
    expect(mockSetSelected).toHaveBeenCalledWith(null);
    expect(mockSetChecked).toHaveBeenCalledWith([]);
  });

  it('clears the consumed answer when the same question and composer value still own it', () => {
    let finishAnswer: (() => void) | undefined;
    mockUseGetMessages.mockReturnValue({ data: liveAsk });
    mockSubmitAskAnswer.mockImplementation(
      (_actionId: string, _answer: string, options?: { onSuccess?: () => void }) => {
        finishAnswer = options?.onSuccess;
      },
    );
    const { result } = renderHook(() => useAskAnswerMode('conversation-A'));

    expect(result.current.submitText('answer from A')).toBe(true);
    finishAnswer?.();

    expect(mockResetComposer).toHaveBeenCalledTimes(1);
    expect(mockSetSelected).toHaveBeenCalledWith(null);
    expect(mockSetChecked).toHaveBeenCalledWith([]);
  });

  it('ignores a delayed answer success after its answer-mode owner unmounts', () => {
    let finishAnswer: (() => void) | undefined;
    mockUseGetMessages.mockReturnValue({ data: liveAsk });
    mockSubmitAskAnswer.mockImplementation(
      (_actionId: string, _answer: string, options?: { onSuccess?: () => void }) => {
        finishAnswer = options?.onSuccess;
      },
    );
    const { result, unmount } = renderHook(() => useAskAnswerMode('conversation-A'));

    expect(result.current.submitText('answer from A')).toBe(true);
    unmount();
    mockSetSelected.mockClear();
    mockSetChecked.mockClear();
    finishAnswer?.();

    expect(mockResetComposer).not.toHaveBeenCalled();
    expect(mockSetSelected).not.toHaveBeenCalled();
    expect(mockSetChecked).not.toHaveBeenCalled();
  });
});
