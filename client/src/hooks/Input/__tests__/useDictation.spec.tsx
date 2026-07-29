import React from 'react';
import { RecoilRoot } from 'recoil';
import { act, renderHook } from '@testing-library/react';
import type { TAskFunction } from '~/common';
import useDictation from '../useDictation';
import store from '~/store';

/**
 * The engines only report a completed transcription when Auto Send Text is
 * configured, so the composer's own stop-and-send cannot be built on that
 * callback alone. These cases pin the three ways a take can be spent — sent on
 * request, sent by the setting, or thrown away — against both engines.
 */

let mockSpeechEndpoint: 'browser' | 'external';
let mockSetTextCallback: (text: string) => void;
let mockOnTranscriptionComplete: (text: string) => void;
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockAbort = jest.fn();
let mockIsListening: boolean;
let mockIsLoading: boolean;

jest.mock('../useSpeechToText', () => ({
  __esModule: true,
  default: (setText: (text: string) => void, complete: (text: string) => void) => {
    mockSetTextCallback = setText;
    mockOnTranscriptionComplete = complete;
    return {
      isListening: mockIsListening,
      isLoading: mockIsLoading,
      startRecording: mockStart,
      stopRecording: mockStop,
      abortRecording: mockAbort,
    };
  },
}));

jest.mock('../useGetAudioSettings', () => ({
  __esModule: true,
  default: () => ({ speechToTextEndpoint: mockSpeechEndpoint }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('../../useLocalize', () => ({
  __esModule: true,
  default: () => (key: string) => key,
}));

const ask = jest.fn(() => true) as unknown as jest.Mock & TAskFunction;

function setup({ autoSendText = -1, draft = '' }: { autoSendText?: number; draft?: string } = {}) {
  let text = draft;
  const methods = {
    setValue: jest.fn((_name: string, value: string) => {
      text = value;
    }),
    reset: jest.fn((values: { text: string }) => {
      text = values.text;
    }),
    getValues: jest.fn(() => text),
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot initializeState={({ set }) => set(store.autoSendText, autoSendText)}>
      {children}
    </RecoilRoot>
  );
  const view = renderHook(
    () =>
      useDictation({
        ask: ask as unknown as TAskFunction,
        methods: methods as never,
        isSubmitting: false,
      }),
    { wrapper },
  );
  return { ...view, methods, currentText: () => text };
}

/** Ends the take the way an engine does: listening clears, then the settle
 *  backstop expires. */
const settle = async (rerender: () => void) => {
  mockIsListening = false;
  act(() => {
    rerender();
  });
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
};

describe('useDictation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockSpeechEndpoint = 'browser';
    mockIsListening = false;
    mockIsLoading = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends on stop-and-send even with Auto Send Text off, which reports no transcription', async () => {
    const { result, rerender, currentText } = setup();
    act(() => result.current.start());
    mockIsListening = true;
    act(() => rerender());

    act(() => mockSetTextCallback('take me somewhere'));
    act(() => result.current.stopAndSend());
    await settle(rerender);

    expect(ask).toHaveBeenCalledWith({ text: 'take me somewhere' });
    expect(currentText()).toBe('');
  });

  it('leaves a plain stop in the composer', async () => {
    const { result, rerender, currentText } = setup();
    act(() => result.current.start());
    mockIsListening = true;
    act(() => rerender());

    act(() => mockSetTextCallback('just a draft'));
    act(() => result.current.stopToComposer());
    await settle(rerender);

    expect(ask).not.toHaveBeenCalled();
    expect(currentText()).toBe('just a draft');
  });

  it('still honours Auto Send Text on a plain stop', async () => {
    const { result, rerender } = setup({ autoSendText: 0 });
    act(() => result.current.start());
    mockIsListening = true;
    act(() => rerender());

    act(() => result.current.stopToComposer());
    await settle(rerender);
    act(() => mockOnTranscriptionComplete('send this for me'));

    expect(ask).toHaveBeenCalledWith({ text: 'send this for me' });
  });

  it('spends a take once when the setting and the send button both reach it', async () => {
    const { result, rerender } = setup({ autoSendText: 0 });
    act(() => result.current.start());
    mockIsListening = true;
    act(() => rerender());

    act(() => mockSetTextCallback('only once'));
    act(() => result.current.stopAndSend());
    await settle(rerender);
    act(() => mockOnTranscriptionComplete('only once'));

    expect(ask).toHaveBeenCalledTimes(1);
  });

  /* The bar disables stop and send once a take is being transcribed, and the
     hook refuses them too: a second stop would rewrite how a take that was
     already committed gets spent. */
  it('ignores a stop that arrives after the take has ended', async () => {
    const { result, rerender, currentText } = setup();
    act(() => result.current.start());
    mockIsListening = true;
    act(() => rerender());

    act(() => mockSetTextCallback('already committed'));
    act(() => result.current.stopToComposer());
    mockIsListening = false;
    act(() => rerender());

    mockStop.mockClear();
    act(() => result.current.stopAndSend());
    await settle(rerender);

    expect(mockStop).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
    expect(currentText()).toBe('already committed');
  });

  it('keeps the draft when a cancelled external transcription lands anyway', async () => {
    mockSpeechEndpoint = 'external';
    const { result, rerender, currentText } = setup({ draft: 'my unsent draft' });
    act(() => result.current.start());
    mockIsListening = true;
    act(() => rerender());

    act(() => result.current.cancel());
    expect(currentText()).toBe('my unsent draft');

    /* The mutation was already in flight, so aborting the recorder cannot stop
       its success callback from arriving. */
    act(() => mockOnTranscriptionComplete('words nobody asked for'));

    expect(ask).not.toHaveBeenCalled();
    expect(currentText()).toBe('my unsent draft');
  });
});
