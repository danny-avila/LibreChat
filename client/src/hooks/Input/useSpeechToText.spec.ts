import { act, renderHook } from '@testing-library/react';
import useSpeechToText from './useSpeechToText';

let mockSpeechToTextEndpoint = 'external';
let mockBrowserIsListening = false;
let mockExternalIsListening = false;

const mockStartSpeechRecordingBrowser = jest.fn();
const mockStopSpeechRecordingBrowser = jest.fn();
const mockStartSpeechRecordingExternal = jest.fn();
const mockStopSpeechRecordingExternal = jest.fn();

jest.mock('./useGetAudioSettings', () => ({
  __esModule: true,
  default: () => ({ speechToTextEndpoint: mockSpeechToTextEndpoint }),
}));

jest.mock('./useSpeechToTextBrowser', () => ({
  __esModule: true,
  default: () => ({
    isListening: mockBrowserIsListening,
    isLoading: false,
    startRecording: mockStartSpeechRecordingBrowser,
    stopRecording: mockStopSpeechRecordingBrowser,
  }),
}));

jest.mock('./useSpeechToTextExternal', () => ({
  __esModule: true,
  default: () => ({
    isListening: mockExternalIsListening,
    isLoading: false,
    externalStartRecording: mockStartSpeechRecordingExternal,
    externalStopRecording: mockStopSpeechRecordingExternal,
  }),
}));

const dispatchSpeechShortcut = () => {
  const event = new KeyboardEvent('keydown', {
    shiftKey: true,
    altKey: true,
    code: 'KeyL',
    bubbles: true,
    cancelable: true,
  });

  act(() => window.dispatchEvent(event));
  return event;
};

describe('useSpeechToText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpeechToTextEndpoint = 'external';
    mockBrowserIsListening = false;
    mockExternalIsListening = false;
  });

  it('starts only the externally seeded engine from the keyboard shortcut', () => {
    mockSpeechToTextEndpoint = 'browser';
    const { rerender } = renderHook(() => useSpeechToText(jest.fn(), jest.fn()));

    mockSpeechToTextEndpoint = 'external';
    rerender();

    const event = dispatchSpeechShortcut();

    expect(mockStartSpeechRecordingExternal).toHaveBeenCalledTimes(1);
    expect(mockStartSpeechRecordingBrowser).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('starts only the browser engine from the keyboard shortcut', () => {
    mockSpeechToTextEndpoint = 'browser';
    renderHook(() => useSpeechToText(jest.fn(), jest.fn()));

    dispatchSpeechShortcut();

    expect(mockStartSpeechRecordingBrowser).toHaveBeenCalledTimes(1);
    expect(mockStartSpeechRecordingExternal).not.toHaveBeenCalled();
  });

  it('stops the active engine when the keyboard shortcut is pressed while listening', () => {
    mockExternalIsListening = true;
    renderHook(() => useSpeechToText(jest.fn(), jest.fn()));

    dispatchSpeechShortcut();

    expect(mockStopSpeechRecordingExternal).toHaveBeenCalledTimes(1);
    expect(mockStartSpeechRecordingExternal).not.toHaveBeenCalled();
    expect(mockStopSpeechRecordingBrowser).not.toHaveBeenCalled();
  });
});
