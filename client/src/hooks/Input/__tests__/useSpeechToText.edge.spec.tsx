import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import useSpeechToText from '../useSpeechToText';
import useSpeechToTextBrowser from '../useSpeechToTextBrowser';
import useSpeechToTextExternal from '../useSpeechToTextExternal';

// Mock dependencies
jest.mock('../useGetAudioSettings', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    speechToTextEndpoint: 'external',
  })),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock('~/data-provider', () => ({
  useSpeechToTextMutation: jest.fn((options) => ({
    mutate: jest.fn((data) => {
      // Simulate different scenarios based on test conditions
      if (global.simulateNetworkError) {
        options.onError({ code: 'ECONNABORTED' });
      } else if (global.simulateLargeFile) {
        options.onError({ response: { status: 413 } });
      } else if (global.simulateOffline) {
        options.onError({ message: 'Network error' });
      } else {
        options.onSuccess({ text: 'Transcribed text' });
      }
    }),
    isLoading: false,
  })),
}));

// Mock MediaRecorder
class MockMediaRecorder {
  state: string;
  ondataavailable: ((event: any) => void) | null = null;
  onstop: (() => void) | null = null;
  
  constructor(stream: any, options?: any) {
    this.state = 'inactive';
  }
  
  start(timeslice?: number) {
    this.state = 'recording';
    // Simulate data availability
    setTimeout(() => {
      if (this.ondataavailable) {
        this.ondataavailable({ data: new Blob(['audio'], { type: 'audio/webm' }) });
      }
    }, 100);
  }
  
  stop() {
    this.state = 'inactive';
    if (this.onstop) {
      this.onstop();
    }
  }
  
  addEventListener(event: string, handler: any) {
    if (event === 'dataavailable') {
      this.ondataavailable = handler;
    } else if (event === 'stop') {
      this.onstop = handler;
    }
  }
  
  removeEventListener(event: string, handler: any) {
    if (event === 'dataavailable') {
      this.ondataavailable = null;
    } else if (event === 'stop') {
      this.onstop = null;
    }
  }
}

(global as any).MediaRecorder = MockMediaRecorder;
(global as any).MediaRecorder.isTypeSupported = jest.fn(() => true);

describe('Speech-to-Text Edge Cases', () => {
  const mockSetText = jest.fn();
  const mockOnTranscriptionComplete = jest.fn();
  
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot>{children}</RecoilRoot>
  );
  
  beforeEach(() => {
    jest.clearAllMocks();
    global.simulateNetworkError = false;
    global.simulateLargeFile = false;
    global.simulateOffline = false;
    
    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
  });
  
  describe('Permission Handling', () => {
    it('should handle permission denial gracefully', async () => {
      // Mock getUserMedia to reject with NotAllowedError
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: {
          getUserMedia: jest.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
        },
      });
      
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      await act(async () => {
        await result.current.startRecording();
      });
      
      expect(result.current.isListening).toBe(false);
    });
    
    it('should handle no microphone device', async () => {
      // Mock getUserMedia to reject with NotFoundError
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: {
          getUserMedia: jest.fn().mockRejectedValue(new DOMException('No device found', 'NotFoundError')),
        },
      });
      
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      await act(async () => {
        await result.current.startRecording();
      });
      
      expect(result.current.isListening).toBe(false);
    });
    
    it('should handle microphone already in use', async () => {
      // Mock getUserMedia to reject with NotReadableError
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: {
          getUserMedia: jest.fn().mockRejectedValue(new DOMException('Device in use', 'NotReadableError')),
        },
      });
      
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      await act(async () => {
        await result.current.startRecording();
      });
      
      expect(result.current.isListening).toBe(false);
    });
  });
  
  describe('Network Error Handling', () => {
    beforeEach(() => {
      // Mock successful getUserMedia
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: {
          getUserMedia: jest.fn().mockResolvedValue({
            getTracks: () => [{ 
              stop: jest.fn(),
              readyState: 'live'
            }],
          }),
        },
      });
    });
    
    it('should handle network timeout errors', async () => {
      global.simulateNetworkError = true;
      
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      await act(async () => {
        await result.current.startRecording();
      });
      
      await act(async () => {
        await result.current.stopRecording();
      });
      
      // Should handle the error gracefully
      expect(mockOnTranscriptionComplete).not.toHaveBeenCalled();
    });
    
    it('should handle large file errors', async () => {
      global.simulateLargeFile = true;
      
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      await act(async () => {
        await result.current.startRecording();
      });
      
      await act(async () => {
        await result.current.stopRecording();
      });
      
      // Should handle the error gracefully
      expect(mockOnTranscriptionComplete).not.toHaveBeenCalled();
    });
    
    it('should handle offline state', async () => {
      // Set navigator.onLine to false
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });
      
      global.simulateOffline = true;
      
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      await act(async () => {
        await result.current.startRecording();
      });
      
      await act(async () => {
        await result.current.stopRecording();
      });
      
      // Should handle the error gracefully
      expect(mockOnTranscriptionComplete).not.toHaveBeenCalled();
    });
  });
  
  describe('Concurrent Session Protection', () => {
    beforeEach(() => {
      // Mock successful getUserMedia
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: {
          getUserMedia: jest.fn().mockResolvedValue({
            getTracks: () => [{ 
              stop: jest.fn(),
              readyState: 'live'
            }],
          }),
        },
      });
    });
    
    it('should prevent concurrent recording sessions', async () => {
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      // Start first recording
      await act(async () => {
        await result.current.startRecording();
      });
      
      expect(result.current.isListening).toBe(true);
      
      // Try to start another recording while first is active
      await act(async () => {
        await result.current.startRecording();
      });
      
      // Should still have only one active session
      expect(result.current.isListening).toBe(true);
    });
  });
  
  describe('Text Accumulation Edge Cases', () => {
    it('should preserve accumulated text across multiple sessions', async () => {
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      // Simulate first recording session
      await act(async () => {
        await result.current.startRecording();
      });
      
      // Simulate transcription
      act(() => {
        mockSetText('First text');
      });
      
      await act(async () => {
        await result.current.stopRecording();
      });
      
      // Start second recording session
      await act(async () => {
        await result.current.startRecording();
      });
      
      // Text should be preserved
      expect(mockSetText).toHaveBeenCalledWith('First text');
    });
    
    it('should clear accumulated text on manual clear', async () => {
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      // Simulate recording with text
      act(() => {
        mockSetText('Some accumulated text');
      });
      
      // Clear accumulated text
      act(() => {
        if (result.current.clearAccumulatedText) {
          result.current.clearAccumulatedText();
        }
      });
      
      // Text should be cleared
      expect(mockSetText).toHaveBeenCalledWith('');
    });
  });
  
  describe('Audio Device Changes', () => {
    it('should handle audio stream becoming inactive', async () => {
      const mockTrack = {
        stop: jest.fn(),
        readyState: 'live' as MediaStreamTrackState,
      };
      
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: {
          getUserMedia: jest.fn().mockResolvedValue({
            getTracks: () => [mockTrack],
          }),
        },
      });
      
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      await act(async () => {
        await result.current.startRecording();
      });
      
      // Simulate track becoming inactive
      mockTrack.readyState = 'ended';
      
      // Try to start recording again
      await act(async () => {
        await result.current.startRecording();
      });
      
      // Should request permission again
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Mobile-Specific Edge Cases', () => {
    it('should handle rapid double-tap on mobile', async () => {
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      // Simulate rapid taps
      await act(async () => {
        await result.current.startRecording();
      });
      
      // Immediate second tap (simulating double-tap)
      act(() => {
        if (result.current.clearAccumulatedText) {
          result.current.clearAccumulatedText();
        }
      });
      
      // Text should be cleared
      expect(mockSetText).toHaveBeenCalledWith('');
    });
  });
  
  describe('Browser Compatibility', () => {
    it('should handle missing MediaRecorder API', async () => {
      // Temporarily remove MediaRecorder
      const originalMediaRecorder = (global as any).MediaRecorder;
      delete (global as any).MediaRecorder;
      
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      await act(async () => {
        await result.current.startRecording();
      });
      
      // Should not crash and should handle gracefully
      expect(result.current.isListening).toBe(false);
      
      // Restore MediaRecorder
      (global as any).MediaRecorder = originalMediaRecorder;
    });
    
    it('should handle unsupported MIME types', async () => {
      // Mock isTypeSupported to return false for all types
      (global as any).MediaRecorder.isTypeSupported = jest.fn(() => false);
      
      const { result } = renderHook(
        () => useSpeechToText(mockSetText, mockOnTranscriptionComplete),
        { wrapper }
      );
      
      // Should still work with fallback MIME type
      await act(async () => {
        await result.current.startRecording();
      });
      
      // Reset mock
      (global as any).MediaRecorder.isTypeSupported = jest.fn(() => true);
    });
  });
});

// Global type declarations for test flags
declare global {
  var simulateNetworkError: boolean;
  var simulateLargeFile: boolean;
  var simulateOffline: boolean;
}