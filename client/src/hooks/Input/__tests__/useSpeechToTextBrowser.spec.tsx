import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import useSpeechToTextBrowser from '../useSpeechToTextBrowser';

// Mock react-speech-recognition
const mockStartListening = jest.fn();
const mockStopListening = jest.fn();
const mockResetTranscript = jest.fn();

jest.mock('react-speech-recognition', () => ({
  __esModule: true,
  default: {
    startListening: mockStartListening,
    stopListening: mockStopListening,
  },
  useSpeechRecognition: () => ({
    listening: false,
    finalTranscript: '',
    resetTranscript: mockResetTranscript,
    interimTranscript: '',
    isMicrophoneAvailable: true,
    browserSupportsSpeechRecognition: true,
  }),
}));

// Mock toast context
jest.mock('@librechat/client', () => ({
  useToastContext: () => ({
    showToast: jest.fn(),
  }),
}));

// Mock audio settings hook
jest.mock('../useGetAudioSettings', () => ({
  __esModule: true,
  default: () => ({
    speechToTextEndpoint: 'browser',
  }),
}));

describe('useSpeechToTextBrowser', () => {
  const mockSetText = jest.fn();
  const mockOnTranscriptionComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot>{children}</RecoilRoot>
  );

  it('should initialize with correct default values', () => {
    const { result } = renderHook(
      () => useSpeechToTextBrowser(mockSetText, mockOnTranscriptionComplete),
      { wrapper },
    );

    expect(result.current.isListening).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(typeof result.current.startRecording).toBe('function');
    expect(typeof result.current.stopRecording).toBe('function');
    expect(typeof result.current.clearAccumulatedText).toBe('function');
  });

  it('should provide clearAccumulatedText function', () => {
    const { result } = renderHook(
      () => useSpeechToTextBrowser(mockSetText, mockOnTranscriptionComplete),
      { wrapper },
    );

    expect(result.current.clearAccumulatedText).toBeDefined();

    act(() => {
      result.current.clearAccumulatedText();
    });

    expect(mockSetText).toHaveBeenCalledWith('');
    expect(mockResetTranscript).toHaveBeenCalled();
  });

  it('should start recording and clear accumulated text', () => {
    const { result } = renderHook(
      () => useSpeechToTextBrowser(mockSetText, mockOnTranscriptionComplete),
      { wrapper },
    );

    act(() => {
      result.current.startRecording();
    });

    expect(mockStartListening).toHaveBeenCalledWith({
      language: '',
      continuous: false,
    });
  });

  it('should stop recording when already listening', () => {
    // Mock listening state
    jest.doMock('react-speech-recognition', () => ({
      __esModule: true,
      default: {
        startListening: mockStartListening,
        stopListening: mockStopListening,
      },
      useSpeechRecognition: () => ({
        listening: true,
        finalTranscript: '',
        resetTranscript: mockResetTranscript,
        interimTranscript: '',
        isMicrophoneAvailable: true,
        browserSupportsSpeechRecognition: true,
      }),
    }));

    const { result } = renderHook(
      () => useSpeechToTextBrowser(mockSetText, mockOnTranscriptionComplete),
      { wrapper },
    );

    act(() => {
      result.current.stopRecording();
    });

    expect(mockStopListening).toHaveBeenCalled();
  });
});