const mockSubmitAskAnswer = jest.fn();
const mockResetComposer = jest.fn();
const mockGetComposerText = jest.fn(() => 'answer from A');
const mockSetSelected = jest.fn();
const mockSetChecked = jest.fn();
let mockSaveDrafts = false;

jest.mock('~/data-provider', () => ({ useGetMessagesByConvoId: jest.fn() }));
jest.mock('~/components/Chat/Messages/Content/ApprovalContext', () => ({
  useAskSubmitStatus: () => ({ getAskStatus: () => 'idle' }),
  useResumeSubmit: () => ({ submitAskAnswer: mockSubmitAskAnswer }),
}));
jest.mock('~/Providers', () => ({
  useOptionalChatFormContext: () => ({
    reset: mockResetComposer,
    getValues: mockGetComposerText,
  }),
}));
jest.mock('~/utils', () => ({ getAskAnswerDraftId: (id: string) => `draft-${id}` }));
jest.mock('recoil', () => ({
  atom: (cfg: unknown) => cfg,
  useRecoilState: (state: { key?: string }) => {
    if (state.key === 'askAnswerModeSelection') {
      return [null, mockSetSelected];
    }
    if (state.key === 'askAnswerModeChecked') {
      return [[], mockSetChecked];
    }
    return [[], jest.fn()];
  },
  useRecoilValue: () => mockSaveDrafts,
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveDrafts = false;
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
    expect(result.current.composerAnswers).toBe(true);
    expect(result.current.composerLocked).toBe(false);
    expect(result.current.popoverVisible).toBe(true);
  });

  it('is inactive when the select finds no live ask', () => {
    mockUseGetMessages.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useAskAnswerMode('conversation-1'));

    expect(result.current.liveAsk).toBeNull();
    expect(result.current.active).toBe(false);
    expect(result.current.composerAnswers).toBe(false);
    expect(result.current.composerLocked).toBe(false);
    expect(result.current.popoverVisible).toBe(false);
  });

  it('locks the composer for a batch, and hands it back the moment it collapses', () => {
    mockUseGetMessages.mockReturnValue({
      data: {
        ...liveAsk,
        questions: [
          { id: 'environment', question: 'Which environment?' },
          { id: 'window', question: 'Which window?' },
        ],
      },
    });

    const { result } = renderHook(() => useAskAnswerMode('conversation-1'));

    expect(result.current.active).toBe(true);
    expect(result.current.batchMode).toBe(true);
    expect(result.current.composerLocked).toBe(true);
    expect(result.current.options).toEqual([]);
    expect(result.current.draftId).toBeNull();
    /** The bounded form owns the answer, so the composer never speaks for it. */
    expect(result.current.composerAnswers).toBe(false);
    expect(result.current.composerLocked).toBe(true);
    /** Text is declined, not claimed: claiming it dropped whatever was staged
     *  when the pause began. */
    expect(result.current.submitText('must stay out of the normal send path')).toBe(false);
    expect(mockSubmitAskAnswer).not.toHaveBeenCalled();
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

  it('yields typed Enter to the shared composer binding resolver', () => {
    mockUseGetMessages.mockReturnValue({ data: liveAsk });
    const { result } = renderHook(() => useAskAnswerMode('conversation-1'));

    const handled = result.current.handleComposerKeyDown({
      key: 'Enter',
      keyCode: 13,
      currentTarget: { value: 'typed answer' },
      nativeEvent: { isComposing: false },
    } as never);

    expect(handled).toBe(false);
    expect(mockSubmitAskAnswer).not.toHaveBeenCalled();
  });

  it('forces liveAsk null when there is no conversation id', () => {
    mockUseGetMessages.mockReturnValue({ data: liveAsk });

    const { result } = renderHook(() => useAskAnswerMode(null));

    expect(result.current.liveAsk).toBeNull();
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
    expect(mockResetComposer).not.toHaveBeenCalled();
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
