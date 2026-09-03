import { RecoilRoot } from 'recoil';
import { act, renderHook, waitFor } from '@testing-library/react';
import useTextToSpeechExternal from './useTextToSpeechExternal';

const mockProcessAudio = jest.fn();
const mockShowToast = jest.fn();

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useTextToSpeechMutation: () => ({ mutate: mockProcessAudio, isLoading: false }),
  useVoicesQuery: () => ({ data: [] }),
}));

jest.mock('~/store', () => {
  const { atom: recoilAtom, atomFamily: recoilAtomFamily } = jest.requireActual('recoil');
  return {
    __esModule: true,
    default: {
      voice: recoilAtom({ key: 'tts-test-voice', default: 'alloy' }),
      cacheTTS: recoilAtom({ key: 'tts-test-cache', default: true }),
      playbackRate: recoilAtom({ key: 'tts-test-rate', default: 1 }),
      globalAudioFetchingFamily: recoilAtomFamily({
        key: 'tts-test-fetching',
        default: false,
      }),
      globalAudioPlayingFamily: recoilAtomFamily({
        key: 'tts-test-playing',
        default: false,
      }),
    },
  };
});

describe('useTextToSpeechExternal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps a cached response loading until audio playback starts', async () => {
    let resolvePlay = () => {};
    const playbackStarted = new Promise<void>((resolve) => {
      resolvePlay = resolve;
    });
    const audio = {
      play: jest.fn(() => playbackStarted),
      pause: jest.fn(),
      playbackRate: 1,
      src: '',
      onended: null,
    } as unknown as HTMLAudioElement;
    window.Audio = jest.fn(() => audio) as unknown as typeof Audio;
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        match: jest.fn().mockResolvedValue({
          blob: jest.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' })),
        }),
      },
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:cached-audio'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    });
    const setIsSpeaking = jest.fn();
    const audioRef = { current: null };
    const { result } = renderHook(
      () =>
        useTextToSpeechExternal({
          setIsSpeaking,
          audioRef,
          messageId: 'message-1',
          isLast: false,
        }),
      { wrapper: RecoilRoot },
    );

    act(() => result.current.generateSpeechExternal('cached response', false));
    await waitFor(() => expect(audio.play).toHaveBeenCalledTimes(1));
    expect(result.current.isLoading).toBe(true);

    await act(async () => resolvePlay());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(setIsSpeaking).toHaveBeenCalledWith(true);
    expect(mockProcessAudio).not.toHaveBeenCalled();
  });
});
