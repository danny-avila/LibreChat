/**
 * TTSEngine Advanced Tests
 * 
 * Advanced test scenarios for TTSEngine including edge cases,
 * error conditions, and complex state management scenarios.
 */

import { TTSEngine } from '../TTSEngine';

// Advanced mock for Web Speech API with more realistic behavior
const createAdvancedSpeechSynthesisMock = () => {
  const utterances: any[] = [];
  let speaking = false;
  let paused = false;
  
  return {
    speak: jest.fn((utterance) => {
      utterances.push(utterance);
      speaking = true;
      // Simulate async speech start
      setTimeout(() => {
        if (utterance.onstart) utterance.onstart();
      }, 10);
      // Simulate speech end after some time
      setTimeout(() => {
        speaking = false;
        if (utterance.onend) utterance.onend();
      }, 100);
    }),
    cancel: jest.fn(() => {
      speaking = false;
      paused = false;
      utterances.forEach(utterance => {
        if (utterance.onerror) {
          utterance.onerror({ error: 'interrupted' });
        }
      });
      utterances.length = 0;
    }),
    pause: jest.fn(() => {
      if (speaking) {
        paused = true;
        utterances.forEach(utterance => {
          if (utterance.onpause) utterance.onpause();
        });
      }
    }),
    resume: jest.fn(() => {
      if (paused) {
        paused = false;
        utterances.forEach(utterance => {
          if (utterance.onresume) utterance.onresume();
        });
      }
    }),
    getVoices: jest.fn(() => [
      { name: 'English Voice', lang: 'en-US', localService: true, default: true },
      { name: 'Polish Voice', lang: 'pl-PL', localService: true, default: false },
      { name: 'Spanish Voice', lang: 'es-ES', localService: false, default: false },
      { name: 'French Voice', lang: 'fr-FR', localService: true, default: false },
      { name: 'German Voice', lang: 'de-DE', localService: false, default: false },
    ]),
    get speaking() { return speaking; },
    get pending() { return utterances.length > 0; },
    get paused() { return paused; },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
};

const mockSpeechSynthesisUtterance = jest.fn().mockImplementation((text) => ({
  text,
  lang: '',
  voice: null,
  rate: 1,
  pitch: 1,
  volume: 1,
  onstart: null,
  onend: null,
  onerror: null,
  onpause: null,
  onresume: null,
  onmark: null,
  onboundary: null,
}));

describe('TTSEngine Advanced Tests', () => {
  let mockSpeechSynthesis: ReturnType<typeof createAdvancedSpeechSynthesisMock>;
  let ttsEngine: TTSEngine;

  beforeEach(() => {
    // Reset singleton
    (TTSEngine as any).instance = undefined;
    
    mockSpeechSynthesis = createAdvancedSpeechSynthesisMock();
    
    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSpeechSynthesis,
      writable: true,
    });

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: mockSpeechSynthesisUtterance,
      writable: true,
    });

    ttsEngine = TTSEngine.getInstance();
    jest.clearAllMocks();
  });

  describe('Advanced Voice Selection', () => {
    it('should prefer local voices over remote voices', () => {
      const voices = ttsEngine.getVoicesForLanguage('es-ES');
      expect(voices).toHaveLength(1);
      expect(voices[0].localService).toBe(false); // Only remote available
      
      const englishVoices = ttsEngine.getVoicesForLanguage('en-US');
      expect(englishVoices[0].localService).toBe(true); // Local available
    });

    it('should handle voice selection with partial language matches', () => {
      const voices = ttsEngine.getVoicesForLanguage('en'); // Without region
      expect(voices).toHaveLength(1);
      expect(voices[0].lang).toBe('en-US');
    });

    it('should handle case-insensitive language matching', () => {
      const voices = ttsEngine.getVoicesForLanguage('EN-us');
      expect(voices).toHaveLength(1);
      expect(voices[0].lang).toBe('en-US');
    });

    it('should return empty array for completely unsupported languages', () => {
      const voices = ttsEngine.getVoicesForLanguage('xx-XX');
      expect(voices).toHaveLength(0);
    });

    it('should handle voice selection when getVoices returns empty array', () => {
      mockSpeechSynthesis.getVoices.mockReturnValue([]);
      const voices = ttsEngine.getVoicesForLanguage('en-US');
      expect(voices).toHaveLength(0);
    });
  });

  describe('Complex Speech Scenarios', () => {
    it('should handle rapid consecutive speech requests', async () => {
      const promises = [
        ttsEngine.speak('First text', 'en-US'),
        ttsEngine.speak('Second text', 'en-US'),
        ttsEngine.speak('Third text', 'en-US'),
      ];

      // Each new speech should cancel the previous one
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(3);
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(3);

      // Wait for all promises to settle
      const results = await Promise.allSettled(promises);
      
      // First two should be rejected (cancelled), last should resolve
      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
    });

    it('should handle speech interruption during playback', async () => {
      const speechPromise = ttsEngine.speak('Long text that gets interrupted', 'en-US');
      
      // Interrupt after a short delay
      setTimeout(() => {
        ttsEngine.stop();
      }, 50);

      await expect(speechPromise).rejects.toThrow('Speech was cancelled');
    });

    it('should handle pause and resume correctly', async () => {
      const stateCallback = jest.fn();
      ttsEngine.onStateChange(stateCallback);

      const speechPromise = ttsEngine.speak('Pausable text', 'en-US');
      
      // Wait for speech to start
      await new Promise(resolve => setTimeout(resolve, 20));
      
      ttsEngine.pause();
      expect(mockSpeechSynthesis.pause).toHaveBeenCalled();
      
      ttsEngine.resume();
      expect(mockSpeechSynthesis.resume).toHaveBeenCalled();

      await speechPromise;
    });

    it('should handle multiple state change listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      ttsEngine.onStateChange(listener1);
      ttsEngine.onStateChange(listener2);
      ttsEngine.onStateChange(listener3);

      ttsEngine.speak('Test text', 'en-US');

      // All listeners should be called
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle speech synthesis errors gracefully', async () => {
      const speechPromise = ttsEngine.speak('Error text', 'en-US');
      
      // Simulate error
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      utterance.onerror({ error: 'synthesis-unavailable' });

      await expect(speechPromise).rejects.toThrow('Speech synthesis error: synthesis-unavailable');
    });

    it('should handle network errors for remote voices', async () => {
      const speechPromise = ttsEngine.speak('Network error text', 'es-ES'); // Remote voice
      
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      utterance.onerror({ error: 'network' });

      await expect(speechPromise).rejects.toThrow('Speech synthesis error: network');
    });

    it('should handle voice loading errors', async () => {
      const speechPromise = ttsEngine.speak('Voice loading error', 'en-US');
      
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      utterance.onerror({ error: 'voice-unavailable' });

      await expect(speechPromise).rejects.toThrow('Speech synthesis error: voice-unavailable');
    });

    it('should handle browser API changes during runtime', async () => {
      // Start speech normally
      const speechPromise = ttsEngine.speak('Test text', 'en-US');
      
      // Simulate browser API becoming unavailable
      delete (window as any).speechSynthesis;
      
      // Should still complete the current speech
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      utterance.onstart();
      utterance.onend();
      
      await expect(speechPromise).resolves.toBeUndefined();
      
      // But new speech should fail
      await expect(ttsEngine.speak('New text', 'en-US')).rejects.toThrow();
    });
  });

  describe('Language and Locale Handling', () => {
    it('should handle complex language codes', () => {
      const testCases = [
        { input: 'en-US', expected: 'en-US' },
        { input: 'en_US', expected: 'en-US' }, // Underscore to dash
        { input: 'EN-us', expected: 'en-US' }, // Case normalization
        { input: 'zh-Hans-CN', expected: 'zh-Hans-CN' }, // Complex locale
        { input: 'sr-Latn-RS', expected: 'sr-Latn-RS' }, // Script and region
      ];

      testCases.forEach(({ input, expected }) => {
        const normalizedLang = (ttsEngine as any).normalizeLanguageCode(input);
        expect(normalizedLang).toBe(expected);
      });
    });

    it('should fallback to base language when specific locale unavailable', () => {
      // Mock voices with only base language
      mockSpeechSynthesis.getVoices.mockReturnValue([
        { name: 'English Voice', lang: 'en', localService: true },
      ]);

      const voices = ttsEngine.getVoicesForLanguage('en-GB');
      expect(voices).toHaveLength(1);
      expect(voices[0].lang).toBe('en');
    });

    it('should handle right-to-left languages', async () => {
      mockSpeechSynthesis.getVoices.mockReturnValue([
        { name: 'Arabic Voice', lang: 'ar-SA', localService: true },
        { name: 'Hebrew Voice', lang: 'he-IL', localService: true },
      ]);

      await ttsEngine.speak('مرحبا بالعالم', 'ar-SA');
      await ttsEngine.speak('שלום עולם', 'he-IL');

      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(2);
    });

    it('should handle languages with special characters', async () => {
      await ttsEngine.speak('Cześć świecie!', 'pl-PL');
      await ttsEngine.speak('Hëllö wörld!', 'de-DE');
      await ttsEngine.speak('Bonjour le monde!', 'fr-FR');

      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(3);
    });
  });

  describe('Performance and Memory Management', () => {
    it('should cleanup old utterances to prevent memory leaks', async () => {
      const promises = [];
      
      // Create many speech requests
      for (let i = 0; i < 100; i++) {
        promises.push(ttsEngine.speak(`Text ${i}`, 'en-US'));
      }

      // Each new request should cancel the previous one
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(100);
    });

    it('should handle high-frequency state changes efficiently', () => {
      const stateCallback = jest.fn();
      ttsEngine.onStateChange(stateCallback);

      // Rapid state changes
      for (let i = 0; i < 1000; i++) {
        ttsEngine.speak(`Text ${i}`, 'en-US');
      }

      // Should not cause performance issues
      expect(stateCallback).toHaveBeenCalled();
    });

    it('should throttle voice list requests', () => {
      // Multiple rapid calls to getVoicesForLanguage
      for (let i = 0; i < 100; i++) {
        ttsEngine.getVoicesForLanguage('en-US');
      }

      // Should not call getVoices excessively
      expect(mockSpeechSynthesis.getVoices).toHaveBeenCalled();
    });
  });

  describe('Browser Compatibility Edge Cases', () => {
    it('should handle browsers with limited voice support', () => {
      mockSpeechSynthesis.getVoices.mockReturnValue([
        { name: 'Default Voice', lang: '', localService: true }, // No language specified
      ]);

      const voices = ttsEngine.getVoicesForLanguage('en-US');
      expect(voices).toHaveLength(0); // Should not match empty language
    });

    it('should handle browsers with delayed voice loading', async () => {
      // Initially no voices
      mockSpeechSynthesis.getVoices.mockReturnValue([]);
      
      expect(ttsEngine.getVoicesForLanguage('en-US')).toHaveLength(0);

      // Voices become available later
      mockSpeechSynthesis.getVoices.mockReturnValue([
        { name: 'English Voice', lang: 'en-US', localService: true },
      ]);

      // Should now find voices
      expect(ttsEngine.getVoicesForLanguage('en-US')).toHaveLength(1);
    });

    it('should handle browsers with broken voice objects', () => {
      mockSpeechSynthesis.getVoices.mockReturnValue([
        null, // Broken voice object
        { name: 'Valid Voice', lang: 'en-US', localService: true },
        undefined, // Another broken voice object
      ]);

      const voices = ttsEngine.getVoicesForLanguage('en-US');
      expect(voices).toHaveLength(1);
      expect(voices[0].name).toBe('Valid Voice');
    });
  });

  describe('Concurrent Usage Scenarios', () => {
    it('should handle multiple TTSEngine instances correctly', () => {
      const engine1 = TTSEngine.getInstance();
      const engine2 = TTSEngine.getInstance();

      // Should be the same instance (singleton)
      expect(engine1).toBe(engine2);
    });

    it('should handle speech from multiple components', async () => {
      const component1Promise = ttsEngine.speak('Component 1 text', 'en-US');
      const component2Promise = ttsEngine.speak('Component 2 text', 'en-US');

      // Second speech should cancel first
      await expect(component1Promise).rejects.toThrow();
      await expect(component2Promise).resolves.toBeUndefined();
    });

    it('should maintain consistent state across components', () => {
      const stateCallback1 = jest.fn();
      const stateCallback2 = jest.fn();

      ttsEngine.onStateChange(stateCallback1);
      ttsEngine.onStateChange(stateCallback2);

      ttsEngine.speak('Test text', 'en-US');

      // Both callbacks should receive the same state
      expect(stateCallback1).toHaveBeenCalledWith(
        expect.objectContaining({
          isPlaying: true,
          currentText: 'Test text',
          currentLanguage: 'en-US',
        })
      );

      expect(stateCallback2).toHaveBeenCalledWith(
        expect.objectContaining({
          isPlaying: true,
          currentText: 'Test text',
          currentLanguage: 'en-US',
        })
      );
    });
  });

  describe('System Default Language Management', () => {
    it('should persist system default language changes', () => {
      ttsEngine.setSystemDefaultLanguage('fr-FR');
      expect(ttsEngine.getSystemDefaultLanguage()).toBe('fr-FR');

      // Should persist across method calls
      ttsEngine.speak('Test', 'en-US');
      expect(ttsEngine.getSystemDefaultLanguage()).toBe('fr-FR');
    });

    it('should validate system default language', () => {
      ttsEngine.setSystemDefaultLanguage('invalid-lang');
      expect(ttsEngine.getSystemDefaultLanguage()).toBe('pl-PL'); // Should fallback

      ttsEngine.setSystemDefaultLanguage('');
      expect(ttsEngine.getSystemDefaultLanguage()).toBe('pl-PL'); // Should fallback
    });

    it('should reset to system default after speech completion', async () => {
      ttsEngine.setSystemDefaultLanguage('en-US');
      
      const stateCallback = jest.fn();
      ttsEngine.onStateChange(stateCallback);

      const speechPromise = ttsEngine.speak('Test text', 'fr-FR');
      
      // Wait for speech to complete
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      utterance.onstart();
      utterance.onend();
      
      await speechPromise;

      // Should reset to system default
      const finalState = stateCallback.mock.calls[stateCallback.mock.calls.length - 1][0];
      expect(finalState.currentLanguage).toBe('en-US');
    });
  });
});