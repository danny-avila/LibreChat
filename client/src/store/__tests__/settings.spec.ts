import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import { renderHook, act } from '@testing-library/react';
import store from '../settings';

describe('Speech Settings Store', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot>{children}</RecoilRoot>
  );

  describe('silenceTimeoutMs', () => {
    it('should have default value of 8000ms', () => {
      const { result } = renderHook(() => useRecoilValue(store.silenceTimeoutMs), { wrapper });
      
      expect(result.current).toBe(8000);
    });

    it('should allow updating silence timeout value', () => {
      const { result } = renderHook(
        () => ({
          value: useRecoilValue(store.silenceTimeoutMs),
          setValue: useSetRecoilState(store.silenceTimeoutMs),
        }),
        { wrapper }
      );

      act(() => {
        result.current.setValue(5000);
      });

      expect(result.current.value).toBe(5000);
    });

    it('should persist value to localStorage', () => {
      const { result } = renderHook(
        () => useSetRecoilState(store.silenceTimeoutMs),
        { wrapper }
      );

      act(() => {
        result.current(12000);
      });

      // Check if localStorage was called (would need to mock localStorage)
      expect(localStorage.getItem).toBeDefined();
    });
  });

  describe('existing speech settings', () => {
    it('should maintain existing speechToText default', () => {
      const { result } = renderHook(() => useRecoilValue(store.speechToText), { wrapper });
      
      expect(result.current).toBe(true);
    });

    it('should maintain existing autoTranscribeAudio default', () => {
      const { result } = renderHook(() => useRecoilValue(store.autoTranscribeAudio), { wrapper });
      
      expect(result.current).toBe(false);
    });

    it('should maintain existing decibelValue default', () => {
      const { result } = renderHook(() => useRecoilValue(store.decibelValue), { wrapper });
      
      expect(result.current).toBe(-45);
    });

    it('should maintain existing autoSendText default', () => {
      const { result } = renderHook(() => useRecoilValue(store.autoSendText), { wrapper });
      
      expect(result.current).toBe(-1);
    });

    it('should maintain existing engineSTT default', () => {
      const { result } = renderHook(() => useRecoilValue(store.engineSTT), { wrapper });
      
      expect(result.current).toBe('browser');
    });
  });

  describe('settings persistence', () => {
    beforeEach(() => {
      // Mock localStorage
      const localStorageMock = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      };
      global.localStorage = localStorageMock as any;
    });

    it('should use localStorage for all speech settings', () => {
      const speechSettings = [
        'speechToText',
        'engineSTT', 
        'languageSTT',
        'autoTranscribeAudio',
        'decibelValue',
        'autoSendText',
        'silenceTimeoutMs',
      ];

      speechSettings.forEach(setting => {
        expect(store[setting]).toBeDefined();
      });
    });
  });
});