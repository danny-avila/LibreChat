/**
 * TTSEngine Unit Tests
 * Tests for the Text-to-Speech engine functionality
 */

import { TTSEngine } from '../TTSEngine';

// Mock Web Speech API
const mockSpeechSynthesis = {
  speak: jest.fn(),
  cancel: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  getVoices: jest.fn(() => [
    { name: 'Voice 1', lang: 'en-US', localService: true },
    { name: 'Voice 2', lang: 'pl-PL', localService: true },
    { name: 'Voice 3', lang: 'es-ES', localService: false },
  ]),
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
}));

// Setup global mocks
Object.defineProperty(window, 'speechSynthesis', {
  value: mockSpeechSynthesis,
  writable: true,
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: mockSpeechSynthesisUtterance,
  writable: true,
});

describe('TTSEngine', () => {
  let ttsEngine: TTSEngine;

  beforeEach(() => {
    // Reset singleton instance
    (TTSEngine as any).instance = undefined;
    ttsEngine = TTSEngine.getInstance();
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = TTSEngine.getInstance();
      const instance2 = TTSEngine.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Browser Support Detection', () => {
    it('should detect TTS support when APIs are available', () => {
      expect(ttsEngine.isSupported()).toBe(true);
    });

    it('should detect lack of TTS support when APIs are not available', () => {
      // Temporarily remove the APIs
      const originalSpeechSynthesis = window.speechSynthesis;
      const originalSpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
      
      delete (window as any).speechSynthesis;
      delete (window as any).SpeechSynthesisUtterance;
      
      const newEngine = TTSEngine.getInstance();
      expect(newEngine.isSupported()).toBe(false);
      
      // Restore APIs
      window.speechSynthesis = originalSpeechSynthesis;
      window.SpeechSynthesisUtterance = originalSpeechSynthesisUtterance;
    });
  });

  describe('Voice Selection', () => {
    it('should get voices for a specific language', () => {
      const voices = ttsEngine.getVoicesForLanguage('en-US');
      expect(voices).toHaveLength(1);
      expect(voices[0].lang).toBe('en-US');
    });

    it('should get voices for language code without region', () => {
      const voices = ttsEngine.getVoicesForLanguage('en');
      expect(voices).toHaveLength(1);
      expect(voices[0].lang).toBe('en-US');
    });

    it('should return empty array for unsupported language', () => {
      const voices = ttsEngine.getVoicesForLanguage('xx-XX');
      expect(voices).toHaveLength(0);
    });

    it('should return empty array when TTS is not supported', () => {
      delete (window as any).speechSynthesis;
      const voices = ttsEngine.getVoicesForLanguage('en-US');
      expect(voices).toHaveLength(0);
    });
  });

  describe('Language Validation', () => {
    it('should accept valid language codes', () => {
      const validCodes = ['en', 'en-US', 'pl-PL', 'es-ES'];
      validCodes.forEach(code => {
        expect(() => ttsEngine.speak('test', code)).not.toThrow();
      });
    });

    it('should fallback to system default for invalid language codes', () => {
      const invalidCodes = ['invalid', 'en-us', 'EN-US', '123', ''];
      invalidCodes.forEach(code => {
        expect(() => ttsEngine.speak('test', code)).not.toThrow();
      });
    });
  });

  describe('Speech Functionality', () => {
    it('should speak text with default language', async () => {
      const promise = ttsEngine.speak('Hello world');
      
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith('Hello world');
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
      
      // Simulate successful speech
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      utterance.onstart();
      utterance.onend();
      
      await expect(promise).resolves.toBeUndefined();
    });

    it('should speak text with specified language', async () => {
      const promise = ttsEngine.speak('Hello world', 'en-US');
      
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith('Hello world');
      
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      expect(utterance.lang).toBe('en-US');
      
      // Simulate successful speech
      utterance.onstart();
      utterance.onend();
      
      await expect(promise).resolves.toBeUndefined();
    });

    it('should reject when TTS is not supported', async () => {
      delete (window as any).speechSynthesis;
      
      await expect(ttsEngine.speak('Hello world')).rejects.toThrow(
        'Text-to-speech is not supported in this browser'
      );
    });

    it('should reject on speech synthesis error', async () => {
      const promise = ttsEngine.speak('Hello world');
      
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      utterance.onstart();
      utterance.onerror({ error: 'synthesis-failed' });
      
      await expect(promise).rejects.toThrow('Speech synthesis error: synthesis-failed');
    });

    it('should stop current speech before starting new speech', async () => {
      ttsEngine.speak('First text');
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
      
      ttsEngine.speak('Second text');
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(2);
    });
  });

  describe('Speech Control', () => {
    it('should stop current speech', () => {
      ttsEngine.stop();
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });

    it('should pause current speech', () => {
      // Set up playing state
      const stateCallback = jest.fn();
      ttsEngine.onStateChange(stateCallback);
      
      const promise = ttsEngine.speak('Hello world');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      utterance.onstart();
      
      ttsEngine.pause();
      expect(mockSpeechSynthesis.pause).toHaveBeenCalled();
    });

    it('should resume paused speech', () => {
      ttsEngine.resume();
      expect(mockSpeechSynthesis.resume).toHaveBeenCalled();
    });

    it('should not pause when not playing', () => {
      ttsEngine.pause();
      expect(mockSpeechSynthesis.pause).not.toHaveBeenCalled();
    });

    it('should not resume when already playing', () => {
      // Set up playing state
      const promise = ttsEngine.speak('Hello world');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      utterance.onstart();
      
      ttsEngine.resume();
      expect(mockSpeechSynthesis.resume).not.toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    it('should update state during speech lifecycle', () => {
      const stateCallback = jest.fn();
      ttsEngine.onStateChange(stateCallback);
      
      const promise = ttsEngine.speak('Hello world', 'en-US');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      
      // Start speech
      utterance.onstart();
      expect(stateCallback).toHaveBeenCalledWith({
        isPlaying: true,
        currentText: 'Hello world',
        currentLanguage: 'en-US',
        currentUtterance: utterance,
      });
      
      // End speech
      utterance.onend();
      expect(stateCallback).toHaveBeenCalledWith({
        isPlaying: false,
        currentText: '',
        currentLanguage: 'pl-PL', // Reset to system default
        currentUtterance: null,
      });
    });

    it('should reset to system default language after completion', () => {
      const stateCallback = jest.fn();
      ttsEngine.onStateChange(stateCallback);
      
      const promise = ttsEngine.speak('Hello world', 'en-US');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      
      utterance.onstart();
      utterance.onend();
      
      const finalState = stateCallback.mock.calls[1][0];
      expect(finalState.currentLanguage).toBe('pl-PL');
    });

    it('should check if currently speaking specific text', () => {
      const promise = ttsEngine.speak('Hello world');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      utterance.onstart();
      
      expect(ttsEngine.isSpeaking('Hello world')).toBe(true);
      expect(ttsEngine.isSpeaking('Other text')).toBe(false);
      expect(ttsEngine.isSpeaking()).toBe(true);
    });

    it('should get current state', () => {
      const state = ttsEngine.getState();
      expect(state).toHaveProperty('isPlaying');
      expect(state).toHaveProperty('currentText');
      expect(state).toHaveProperty('currentLanguage');
      expect(state).toHaveProperty('currentUtterance');
    });
  });

  describe('System Default Language', () => {
    it('should get system default language', () => {
      expect(ttsEngine.getSystemDefaultLanguage()).toBe('pl-PL');
    });

    it('should set system default language', () => {
      ttsEngine.setSystemDefaultLanguage('en-US');
      expect(ttsEngine.getSystemDefaultLanguage()).toBe('en-US');
    });

    it('should validate system default language', () => {
      ttsEngine.setSystemDefaultLanguage('invalid');
      expect(ttsEngine.getSystemDefaultLanguage()).toBe('pl-PL'); // Should fallback
    });
  });

  describe('Error Handling', () => {
    it('should handle missing voices gracefully', async () => {
      mockSpeechSynthesis.getVoices.mockReturnValue([]);
      
      const promise = ttsEngine.speak('Hello world', 'en-US');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      
      // Should still attempt to speak even without specific voice
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
      
      utterance.onstart();
      utterance.onend();
      
      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle speech synthesis errors', async () => {
      const promise = ttsEngine.speak('Hello world');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      
      utterance.onerror({ error: 'network' });
      
      await expect(promise).rejects.toThrow('Speech synthesis error: network');
    });
  });

  describe('Concurrent Speech Management', () => {
    it('should stop previous speech when starting new speech', () => {
      ttsEngine.speak('First text');
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(1);
      
      ttsEngine.speak('Second text');
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(2);
    });

    it('should handle rapid consecutive speech requests', () => {
      ttsEngine.speak('Text 1');
      ttsEngine.speak('Text 2');
      ttsEngine.speak('Text 3');
      
      // Should cancel previous speeches
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(3);
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(3);
    });
  });
});