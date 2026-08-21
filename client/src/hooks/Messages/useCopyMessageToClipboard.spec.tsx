import { RecoilRoot } from 'recoil';
import copy from 'copy-to-clipboard';
import { renderHook, act } from '@testing-library/react';
import type { MutableSnapshot } from 'recoil';
import type { ReactNode } from 'react';
import { useCopyMessageToClipboard } from '~/hooks/Messages/useCopyToClipboard';
import store from '~/store';

jest.mock('copy-to-clipboard');

describe('useCopyMessageToClipboard', () => {
  const mockSetIsCopied = jest.fn();
  const mockCopy = copy as jest.MockedFunction<typeof copy>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCopy.mockReturnValue(true);
  });

  const renderWithSettings = (
    settings: { copyRichText: boolean; enableUserMsgMarkdown: boolean },
    isCreatedByUser: boolean,
  ) => {
    const initializeState = ({ set }: MutableSnapshot) => {
      set(store.copyRichText, settings.copyRichText);
      set(store.enableUserMsgMarkdown, settings.enableUserMsgMarkdown);
    };

    return renderHook(() => useCopyMessageToClipboard({ text: '# Title', isCreatedByUser }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecoilRoot initializeState={initializeState}>{children}</RecoilRoot>
      ),
    });
  };

  const copiedAsHtml = (): boolean => {
    const [, options] = mockCopy.mock.calls[0];
    return options?.onCopy != null;
  };

  it('copies an assistant message as html when the preference is on', () => {
    const { result } = renderWithSettings(
      { copyRichText: true, enableUserMsgMarkdown: false },
      false,
    );

    act(() => {
      result.current(mockSetIsCopied);
    });

    expect(copiedAsHtml()).toBe(true);
  });

  it('keeps a user message plain when its markdown rendering is off', () => {
    const { result } = renderWithSettings(
      { copyRichText: true, enableUserMsgMarkdown: false },
      true,
    );

    act(() => {
      result.current(mockSetIsCopied);
    });

    expect(copiedAsHtml()).toBe(false);
  });

  it('copies a user message as html once its markdown rendering is on', () => {
    const { result } = renderWithSettings(
      { copyRichText: true, enableUserMsgMarkdown: true },
      true,
    );

    act(() => {
      result.current(mockSetIsCopied);
    });

    expect(copiedAsHtml()).toBe(true);
  });

  it('stays plain for every author when the preference is off', () => {
    const { result } = renderWithSettings(
      { copyRichText: false, enableUserMsgMarkdown: true },
      false,
    );

    act(() => {
      result.current(mockSetIsCopied);
    });

    expect(copiedAsHtml()).toBe(false);
  });
});
