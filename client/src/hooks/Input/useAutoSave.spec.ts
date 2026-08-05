jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilValue: jest.fn(),
}));

jest.mock('~/store', () => ({
  saveDrafts: { key: 'saveDrafts', default: true },
}));

jest.mock('~/Providers', () => ({
  useChatFormContext: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetFiles: jest.fn(),
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  getDraft: jest.fn(),
  setDraft: jest.fn(),
  clearDraft: jest.fn(),
  clearAllDrafts: jest.fn(),
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useRecoilValue } from 'recoil';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import { useChatFormContext } from '~/Providers';
import { useGetFiles } from '~/data-provider';
import { encodeBase64, getAskAnswerDraftId, getDraft, setDraft } from '~/utils';
import store from '~/store';
import { useAutoSave } from '~/hooks';

const mockSetValue = jest.fn();
const mockGetDraft = getDraft as jest.Mock;
const mockSetDraft = setDraft as jest.Mock;

const makeTextAreaRef = (value = '') =>
  ({
    current: { value, addEventListener: jest.fn(), removeEventListener: jest.fn() },
  }) as unknown as React.RefObject<HTMLTextAreaElement>;

beforeEach(() => {
  (useRecoilValue as jest.Mock).mockImplementation((atom) => {
    if (atom === store.saveDrafts) return true;
    return undefined;
  });
  (useChatFormContext as jest.Mock).mockReturnValue({ setValue: mockSetValue });
  (useGetFiles as jest.Mock).mockReturnValue({ data: [] });
  mockGetDraft.mockReturnValue('');
});

describe('useAutoSave — conversation switching', () => {
  it('clears the textarea when switching to a conversation with no draft', () => {
    const { rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useAutoSave({
          conversationId,
          textAreaRef: makeTextAreaRef(),
          files: new Map(),
          setFiles: jest.fn(),
        }),
      { initialProps: { conversationId: 'convo-1' } },
    );

    act(() => {
      rerender({ conversationId: 'convo-2' });
    });

    expect(mockSetValue).toHaveBeenLastCalledWith('text', '');
  });

  it('restores the saved draft when switching to a conversation with one', () => {
    mockGetDraft.mockImplementation((id: string) => (id === 'convo-2' ? 'Hello, world!' : ''));

    const { rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useAutoSave({
          conversationId,
          textAreaRef: makeTextAreaRef(),
          files: new Map(),
          setFiles: jest.fn(),
        }),
      { initialProps: { conversationId: 'convo-1' } },
    );

    act(() => {
      rerender({ conversationId: 'convo-2' });
    });

    expect(mockSetValue).toHaveBeenLastCalledWith('text', 'Hello, world!');
  });

  it('saves the current textarea content before switching away', () => {
    const textAreaRef = makeTextAreaRef('draft in progress');

    const { rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useAutoSave({ conversationId, textAreaRef, files: new Map(), setFiles: jest.fn() }),
      { initialProps: { conversationId: 'convo-1' } },
    );

    act(() => {
      rerender({ conversationId: 'convo-2' });
    });

    expect(mockSetDraft).toHaveBeenCalledWith({ id: 'convo-1', value: 'draft in progress' });
  });
});

describe('useAutoSave — ask-answer draft swap', () => {
  const askDraftId = getAskAnswerDraftId('action-1');
  const pendingTextKey = `${LocalStorageKeys.TEXT_DRAFT}${Constants.PENDING_CONVO}`;

  afterEach(() => {
    localStorage.clear();
  });

  it('stashes the conversation draft and empties the box when answer mode takes the key', () => {
    const textAreaRef = makeTextAreaRef('half-typed message');

    const { rerender } = renderHook(
      ({ draftId }: { draftId: string | null }) =>
        useAutoSave({
          conversationId: 'convo-1',
          draftId,
          textAreaRef,
          files: new Map(),
          setFiles: jest.fn(),
        }),
      { initialProps: { draftId: null as string | null } },
    );

    act(() => {
      rerender({ draftId: askDraftId });
    });

    expect(mockSetDraft).toHaveBeenCalledWith({ id: 'convo-1', value: 'half-typed message' });
    expect(mockSetValue).toHaveBeenLastCalledWith('text', '');
  });

  it('wins over the PENDING_CONVO redirect without migrating the pending draft', () => {
    // A question pause happens mid-run (isSubmitting), where drafts normally
    // go to PENDING_CONVO. The ask key must take over AND be exempt from the
    // PENDING → new-id migration, which would move-and-delete the very draft
    // the swap-back is supposed to restore.
    localStorage.setItem(pendingTextKey, encodeBase64('pre-pause draft'));
    const textAreaRef = makeTextAreaRef('mid-run typing');

    const { rerender } = renderHook(
      ({ draftId }: { draftId: string | null }) =>
        useAutoSave({
          conversationId: 'convo-1',
          isSubmitting: true,
          draftId,
          textAreaRef,
          files: new Map(),
          setFiles: jest.fn(),
        }),
      { initialProps: { draftId: null as string | null } },
    );

    act(() => {
      rerender({ draftId: askDraftId });
    });

    expect(mockSetDraft).toHaveBeenCalledWith({
      id: Constants.PENDING_CONVO,
      value: 'mid-run typing',
    });
    expect(localStorage.getItem(pendingTextKey)).toBe(encodeBase64('pre-pause draft'));
    expect(localStorage.getItem(`${LocalStorageKeys.TEXT_DRAFT}${askDraftId}`)).toBeNull();
  });

  it('restores the stashed draft when the question resolves', () => {
    mockGetDraft.mockImplementation((id: string) =>
      id === Constants.PENDING_CONVO ? 'pre-pause draft' : '',
    );

    const { rerender } = renderHook(
      ({ draftId }: { draftId: string | null }) =>
        useAutoSave({
          conversationId: 'convo-1',
          isSubmitting: true,
          draftId,
          textAreaRef: makeTextAreaRef(),
          files: new Map(),
          setFiles: jest.fn(),
        }),
      { initialProps: { draftId: askDraftId as string | null } },
    );

    act(() => {
      rerender({ draftId: null });
    });

    expect(mockSetValue).toHaveBeenLastCalledWith('text', 'pre-pause draft');
  });

  it('restores a half-typed answer for the same question (reload while paused)', () => {
    mockGetDraft.mockImplementation((id: string) => (id === askDraftId ? 'half-typed answer' : ''));

    renderHook(() =>
      useAutoSave({
        conversationId: 'convo-1',
        draftId: askDraftId,
        textAreaRef: makeTextAreaRef(),
        files: new Map(),
        setFiles: jest.fn(),
      }),
    );

    expect(mockSetValue).toHaveBeenLastCalledWith('text', 'half-typed answer');
  });
});

describe('useAutoSave — debounced autosave', () => {
  /** Grabs the `input` listener the hook registered on the textarea. */
  const getInputListener = (textAreaRef: React.RefObject<HTMLTextAreaElement>) =>
    (textAreaRef.current!.addEventListener as unknown as jest.Mock).mock.calls.find(
      ([event]) => event === 'input',
    )![1] as (e: unknown) => void;

  afterEach(() => {
    jest.useRealTimers();
  });

  it('flushes the live composer value, not the value captured when typing', () => {
    jest.useFakeTimers();
    // A run is active, so the draft is keyed under PENDING_CONVO.
    const textAreaRef = makeTextAreaRef('queued follow up');
    renderHook(() =>
      useAutoSave({
        isSubmitting: true,
        conversationId: 'convo-1',
        textAreaRef,
        files: new Map(),
        setFiles: jest.fn(),
      }),
    );

    act(() => {
      getInputListener(textAreaRef)({ target: { value: 'queued follow up' } });
    });

    // A during-run steer/queue took the text and cleared the composer inside
    // the 25ms debounce window. The in-flight write must not resurrect it:
    // run end migrates a surviving pending draft back into the textarea.
    textAreaRef.current!.value = '';
    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(mockSetDraft).toHaveBeenLastCalledWith({
      id: Constants.PENDING_CONVO,
      value: '',
    });
  });

  it('still saves typed text when the composer is untouched', () => {
    jest.useFakeTimers();
    const textAreaRef = makeTextAreaRef('still typing');
    renderHook(() =>
      useAutoSave({
        conversationId: 'convo-1',
        textAreaRef,
        files: new Map(),
        setFiles: jest.fn(),
      }),
    );

    act(() => {
      getInputListener(textAreaRef)({ target: { value: 'still typing' } });
      jest.advanceTimersByTime(50);
    });

    expect(mockSetDraft).toHaveBeenLastCalledWith({ id: 'convo-1', value: 'still typing' });
  });
});
