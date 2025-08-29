/**
 * TTSEngine - Text-to-Speech engine using Web Speech API
 * Handles speech synthesis with language-specific voice selection and queue management
 */

export interface TTSConfig {
  language: string;
  rate: number;
  pitch: number;
  volume: number;
}

export interface TTSState {
  isPlaying: boolean;
  currentText: string;
  currentLanguage: string;
  currentUtterance: SpeechSynthesisUtterance | null;
}

export class TTSEngine {
  private static instance: TTSEngine;
  private state: TTSState;
  private defaultConfig: TTSConfig;
  private systemDefaultLanguage: string;
  private stateChangeCallback?: (state: TTSState) => void;

  private constructor() {
    this.systemDefaultLanguage = 'pl-PL'; // Default language as per requirements
    this.defaultConfig = {
      language: this.systemDefaultLanguage,
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
    };
    
    this.state = {
      isPlaying: false,
      currentText: '',
      currentLanguage: this.systemDefaultLanguage,
      currentUtterance: null,
    };
  }

  public static getInstance(): TTSEngine {
    if (!TTSEngine.instance) {
      TTSEngine.instance = new TTSEngine();
    }
    return TTSEngine.instance;
  }

  /**
   * Check if TTS is supported by the browser
   */
  public isSupported(): boolean {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  /**
   * Get available voices for a specific language
   */
  public getVoicesForLanguage(language: string): SpeechSynthesisVoice[] {
    if (!this.isSupported()) return [];
    
    const voices = speechSynthesis.getVoices();
    return voices.filter(voice => 
      voice.lang.toLowerCase().startsWith(language.toLowerCase().split('-')[0])
    );
  }

  /**
   * Get the best voice for a language (prefer local voices)
   */
  private getBestVoice(language: string): SpeechSynthesisVoice | null {
    const voices = this.getVoicesForLanguage(language);
    if (voices.length === 0) return null;

    // Prefer local voices over remote ones
    const localVoices = voices.filter(voice => voice.localService);
    if (localVoices.length > 0) {
      return localVoices[0];
    }

    return voices[0];
  }

  /**
   * Set state change callback for UI updates
   */
  public onStateChange(callback: (state: TTSState) => void): void {
    this.stateChangeCallback = callback;
  }

  /**
   * Update state and notify listeners
   */
  private updateState(updates: Partial<TTSState>): void {
    this.state = { ...this.state, ...updates };
    if (this.stateChangeCallback) {
      this.stateChangeCallback(this.state);
    }
  }

  /**
   * Speak text with specified language
   */
  public speak(text: string, language: string = this.systemDefaultLanguage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        reject(new Error('Text-to-speech is not supported in this browser'));
        return;
      }

      // Stop any current speech
      this.stop();

      // Validate and fallback language
      const targetLanguage = this.validateLanguage(language);
      const voice = this.getBestVoice(targetLanguage);

      if (!voice) {
        // Fallback to system default if no voice found
        const defaultVoice = this.getBestVoice(this.systemDefaultLanguage);
        if (!defaultVoice) {
          reject(new Error(`No voice available for language: ${targetLanguage}`));
          return;
        }
      }

      const utterance = new SpeechSynthesisUtterance(text);
      
      // Configure utterance
      utterance.voice = voice || this.getBestVoice(this.systemDefaultLanguage);
      utterance.lang = targetLanguage;
      utterance.rate = this.defaultConfig.rate;
      utterance.pitch = this.defaultConfig.pitch;
      utterance.volume = this.defaultConfig.volume;

      // Set up event handlers
      utterance.onstart = () => {
        this.updateState({
          isPlaying: true,
          currentText: text,
          currentLanguage: targetLanguage,
          currentUtterance: utterance,
        });
      };

      utterance.onend = () => {
        this.updateState({
          isPlaying: false,
          currentText: '',
          currentLanguage: this.systemDefaultLanguage, // Reset to system default
          currentUtterance: null,
        });
        resolve();
      };

      utterance.onerror = (event) => {
        this.updateState({
          isPlaying: false,
          currentText: '',
          currentLanguage: this.systemDefaultLanguage,
          currentUtterance: null,
        });
        reject(new Error(`Speech synthesis error: ${event.error}`));
      };

      utterance.onpause = () => {
        this.updateState({ isPlaying: false });
      };

      utterance.onresume = () => {
        this.updateState({ isPlaying: true });
      };

      // Start speaking
      speechSynthesis.speak(utterance);
    });
  }

  /**
   * Stop current speech and reset to system default
   */
  public stop(): void {
    if (!this.isSupported()) return;

    speechSynthesis.cancel();
    this.updateState({
      isPlaying: false,
      currentText: '',
      currentLanguage: this.systemDefaultLanguage,
      currentUtterance: null,
    });
  }

  /**
   * Pause current speech
   */
  public pause(): void {
    if (!this.isSupported() || !this.state.isPlaying) return;
    speechSynthesis.pause();
  }

  /**
   * Resume paused speech
   */
  public resume(): void {
    if (!this.isSupported() || this.state.isPlaying) return;
    speechSynthesis.resume();
  }

  /**
   * Get current TTS state
   */
  public getState(): TTSState {
    return { ...this.state };
  }

  /**
   * Validate language code and provide fallback
   */
  private validateLanguage(language: string): string {
    // Basic language code validation
    const languageRegex = /^[a-z]{2}(-[A-Z]{2})?$/;
    if (!languageRegex.test(language)) {
      console.warn(`Invalid language code: ${language}, falling back to ${this.systemDefaultLanguage}`);
      return this.systemDefaultLanguage;
    }
    return language;
  }

  /**
   * Check if currently speaking specific text
   */
  public isSpeaking(text?: string): boolean {
    if (!text) return this.state.isPlaying;
    return this.state.isPlaying && this.state.currentText === text;
  }

  /**
   * Get system default language
   */
  public getSystemDefaultLanguage(): string {
    return this.systemDefaultLanguage;
  }

  /**
   * Set system default language
   */
  public setSystemDefaultLanguage(language: string): void {
    this.systemDefaultLanguage = this.validateLanguage(language);
    this.defaultConfig.language = this.systemDefaultLanguage;
  }
}

export default TTSEngine;