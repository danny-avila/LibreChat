/**
 * AccessibilityUtils Tests
 * 
 * Tests for accessibility utilities including ARIA labels, keyboard navigation,
 * screen reader support, and focus management.
 */

import {
  globalAccessibilityUtils,
  getAccessibilityConfig,
  updateAccessibilityConfig,
  getAriaLabels,
  getKeyboardHandlers,
  getFocusManager,
  getLiveRegionManager,
  generateAltText,
  generateChartDescription,
  prefersReducedMotion,
  prefersHighContrast,
} from '../utils/AccessibilityUtils';

// Mock DOM APIs
const mockMatchMedia = (matches: boolean) => ({
  matches,
  media: '',
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
});

// Mock DOM elements
const createMockElement = (tagName: string = 'div') => {
  const element = document.createElement(tagName);
  element.setAttribute = jest.fn();
  element.addEventListener = jest.fn();
  element.removeEventListener = jest.fn();
  element.focus = jest.fn();
  element.contains = jest.fn().mockReturnValue(true);
  return element;
};

describe('AccessibilityUtils', () => {
  let mockLiveRegion: HTMLElement;
  let mockStatusRegion: HTMLElement;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => {
        if (query.includes('prefers-reduced-motion')) {
          return mockMatchMedia(false);
        }
        if (query.includes('prefers-contrast')) {
          return mockMatchMedia(false);
        }
        return mockMatchMedia(false);
      }),
    });

    // Create mock live regions
    mockLiveRegion = createMockElement('div');
    mockStatusRegion = createMockElement('div');
    
    jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'div') {
        return createMockElement('div');
      }
      return document.createElement(tagName);
    });

    jest.spyOn(document.body, 'appendChild').mockImplementation((element) => {
      return element;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    globalAccessibilityUtils.cleanup();
  });

  describe('Configuration Management', () => {
    it('should return default accessibility configuration', () => {
      const config = getAccessibilityConfig();
      
      expect(config).toEqual({
        enableKeyboardNavigation: true,
        enableScreenReaderSupport: true,
        enableLiveRegions: true,
        enableFocusManagement: true,
        announceContentChanges: true,
      });
    });

    it('should update accessibility configuration', () => {
      updateAccessibilityConfig({
        enableKeyboardNavigation: false,
        enableLiveRegions: false,
      });

      const config = getAccessibilityConfig();
      expect(config.enableKeyboardNavigation).toBe(false);
      expect(config.enableLiveRegions).toBe(false);
      expect(config.enableScreenReaderSupport).toBe(true); // Should remain unchanged
    });
  });

  describe('ARIA Labels', () => {
    let ariaLabels: ReturnType<typeof getAriaLabels>;

    beforeEach(() => {
      ariaLabels = getAriaLabels();
    });

    it('should generate TTS button labels', () => {
      const playingLabel = ariaLabels.ttsButton('Hello world', 'en-US', true);
      const stoppedLabel = ariaLabels.ttsButton('Hello world', 'en-US', false);

      expect(playingLabel).toBe('Stop reading "Hello world" in en-US');
      expect(stoppedLabel).toBe('Read "Hello world" aloud in en-US');
    });

    it('should generate TTS text labels', () => {
      const label = ariaLabels.ttsText('Hello world', 'en-US');
      expect(label).toBe('Clickable text for speech synthesis: "Hello world" in en-US');
    });

    it('should generate TTS status labels', () => {
      const playingStatus = ariaLabels.ttsStatus(true, 'Hello world');
      const stoppedStatus = ariaLabels.ttsStatus(false);

      expect(playingStatus).toBe('Currently reading: Hello world');
      expect(stoppedStatus).toBe('Text-to-speech stopped');
    });

    it('should generate multimedia labels', () => {
      const imageLabel = ariaLabels.image('A beautiful sunset');
      const videoLabel = ariaLabels.video('Tutorial video');
      const audioLabel = ariaLabels.audio('Podcast episode');

      expect(imageLabel).toBe('A beautiful sunset');
      expect(videoLabel).toBe('Video: Tutorial video');
      expect(audioLabel).toBe('Audio: Podcast episode');
    });

    it('should generate chart labels', () => {
      const chartLabel = ariaLabels.chart('bar', 10, 2);
      expect(chartLabel).toBe('bar chart with 2 datasets and 10 data points');
    });

    it('should generate code execution labels', () => {
      const executeLabel = ariaLabels.executeButton('python', false);
      const executingLabel = ariaLabels.executeButton('python', true);

      expect(executeLabel).toBe('Execute python code');
      expect(executingLabel).toBe('Executing python code, please wait');
    });
  });

  describe('Keyboard Handlers', () => {
    let keyboardHandlers: ReturnType<typeof getKeyboardHandlers>;
    let mockCallback: jest.Mock;
    let mockEvent: Partial<React.KeyboardEvent>;

    beforeEach(() => {
      keyboardHandlers = getKeyboardHandlers();
      mockCallback = jest.fn();
      mockEvent = {
        key: '',
        preventDefault: jest.fn(),
      };
    });

    it('should handle Enter and Space keys', () => {
      const handler = keyboardHandlers.onEnterOrSpace(mockCallback);

      // Test Enter key
      mockEvent.key = 'Enter';
      handler(mockEvent as React.KeyboardEvent);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);

      // Test Space key
      mockEvent.key = ' ';
      handler(mockEvent as React.KeyboardEvent);
      expect(mockCallback).toHaveBeenCalledTimes(2);
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(2);

      // Test other key (should not trigger)
      mockEvent.key = 'Tab';
      handler(mockEvent as React.KeyboardEvent);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should handle Escape key', () => {
      const handler = keyboardHandlers.onEscape(mockCallback);

      mockEvent.key = 'Escape';
      handler(mockEvent as React.KeyboardEvent);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('should handle arrow keys', () => {
      const callbacks = {
        up: jest.fn(),
        down: jest.fn(),
        left: jest.fn(),
        right: jest.fn(),
      };
      const handler = keyboardHandlers.onArrowKeys(callbacks);

      // Test all arrow keys
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].forEach((key, index) => {
        mockEvent.key = key;
        handler(mockEvent as React.KeyboardEvent);
        expect(mockEvent.preventDefault).toHaveBeenCalledTimes(index + 1);
      });

      expect(callbacks.up).toHaveBeenCalledTimes(1);
      expect(callbacks.down).toHaveBeenCalledTimes(1);
      expect(callbacks.left).toHaveBeenCalledTimes(1);
      expect(callbacks.right).toHaveBeenCalledTimes(1);
    });
  });

  describe('Focus Manager', () => {
    let focusManager: ReturnType<typeof getFocusManager>;
    let mockContainer: HTMLElement;
    let mockButton1: HTMLButtonElement;
    let mockButton2: HTMLButtonElement;
    let mockInput: HTMLInputElement;

    beforeEach(() => {
      focusManager = getFocusManager();
      mockContainer = createMockElement('div');
      mockButton1 = createMockElement('button') as HTMLButtonElement;
      mockButton2 = createMockElement('button') as HTMLButtonElement;
      mockInput = createMockElement('input') as HTMLInputElement;

      // Mock querySelectorAll
      mockContainer.querySelectorAll = jest.fn().mockReturnValue([
        mockButton1,
        mockButton2,
        mockInput,
      ]);
    });

    it('should find focusable elements', () => {
      const focusableElements = focusManager.setFocusableElements(mockContainer);
      
      expect(mockContainer.querySelectorAll).toHaveBeenCalledWith(
        expect.stringContaining('button:not([disabled])')
      );
      expect(focusableElements).toHaveLength(3);
    });

    it('should manage focus order', () => {
      const elements = [mockButton1, mockButton2, mockInput];
      focusManager.manageFocusOrder(elements);

      expect(mockButton1.setAttribute).toHaveBeenCalledWith('tabindex', '0');
      expect(mockButton2.setAttribute).toHaveBeenCalledWith('tabindex', '-1');
      expect(mockInput.setAttribute).toHaveBeenCalledWith('tabindex', '-1');
    });

    it('should trap focus within container', () => {
      const elements = [mockButton1, mockButton2];
      mockContainer.querySelectorAll = jest.fn().mockReturnValue(elements);
      
      const cleanup = focusManager.trapFocus(mockContainer);
      
      expect(mockContainer.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
      
      // Test cleanup
      cleanup();
      expect(mockContainer.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should restore focus to previous element', () => {
      const previousElement = createMockElement('button');
      document.contains = jest.fn().mockReturnValue(true);
      
      focusManager.restoreFocus(previousElement);
      expect(previousElement.focus).toHaveBeenCalled();
    });
  });

  describe('Live Region Manager', () => {
    let liveRegionManager: ReturnType<typeof getLiveRegionManager>;

    beforeEach(() => {
      liveRegionManager = getLiveRegionManager();
    });

    it('should announce messages with polite priority', (done) => {
      const message = 'Content loaded successfully';
      liveRegionManager.announce(message, 'polite');

      // Check that the message is set after a delay
      setTimeout(() => {
        expect(document.createElement).toHaveBeenCalledWith('div');
        done();
      }, 150);
    });

    it('should announce status with assertive priority', (done) => {
      const status = 'Error occurred';
      liveRegionManager.announceStatus(status, 'assertive');

      setTimeout(() => {
        expect(document.createElement).toHaveBeenCalledWith('div');
        done();
      }, 150);
    });

    it('should clear live regions', () => {
      liveRegionManager.clear();
      // This should not throw any errors
      expect(true).toBe(true);
    });
  });

  describe('Content Description Generators', () => {
    it('should generate alt text for multimedia', () => {
      const imageAlt = generateAltText('image', 'https://example.com/sunset.jpg');
      const videoAlt = generateAltText('video', 'https://example.com/tutorial.mp4', { duration: '5:30' });
      const audioAlt = generateAltText('audio', 'https://example.com/podcast.mp3');

      expect(imageAlt).toBe('Image: sunset.jpg');
      expect(videoAlt).toBe('Video: tutorial.mp4 (5:30)');
      expect(audioAlt).toBe('Audio: podcast.mp3');
    });

    it('should generate chart descriptions', () => {
      const chartData = {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [
          { label: 'Sales', data: [100, 200, 150] },
          { label: 'Profit', data: [50, 100, 75] },
        ],
      };

      const description = generateChartDescription('bar', chartData);
      
      expect(description).toContain('bar chart with 2 datasets and 3 data points');
      expect(description).toContain('Datasets: Sales, Profit');
      expect(description).toContain('Data range: 50 to 200');
    });

    it('should handle invalid chart data', () => {
      const description = generateChartDescription('pie', null);
      expect(description).toBe('pie chart with invalid data');
    });
  });

  describe('User Preferences', () => {
    it('should detect reduced motion preference', () => {
      // Mock reduced motion preference
      window.matchMedia = jest.fn().mockImplementation((query) => {
        if (query.includes('prefers-reduced-motion')) {
          return mockMatchMedia(true);
        }
        return mockMatchMedia(false);
      });

      const reducedMotion = prefersReducedMotion();
      expect(reducedMotion).toBe(true);
    });

    it('should detect high contrast preference', () => {
      // Mock high contrast preference
      window.matchMedia = jest.fn().mockImplementation((query) => {
        if (query.includes('prefers-contrast')) {
          return mockMatchMedia(true);
        }
        return mockMatchMedia(false);
      });

      const highContrast = prefersHighContrast();
      expect(highContrast).toBe(true);
    });

    it('should handle missing matchMedia API', () => {
      // Remove matchMedia
      delete (window as any).matchMedia;

      const reducedMotion = prefersReducedMotion();
      const highContrast = prefersHighContrast();

      expect(reducedMotion).toBe(false);
      expect(highContrast).toBe(false);
    });
  });

  describe('Live Region Initialization', () => {
    it('should initialize live regions on construction', () => {
      // The constructor should have been called during import
      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(document.body.appendChild).toHaveBeenCalled();
    });

    it('should handle server-side rendering', () => {
      // Mock server environment
      const originalWindow = global.window;
      delete (global as any).window;

      // This should not throw
      expect(() => {
        const { globalAccessibilityUtils: serverUtils } = require('../utils/AccessibilityUtils');
      }).not.toThrow();

      // Restore window
      global.window = originalWindow;
    });
  });

  describe('Cleanup', () => {
    it('should cleanup live regions', () => {
      const mockRemoveChild = jest.fn();
      document.body.removeChild = mockRemoveChild;
      document.contains = jest.fn().mockReturnValue(true);

      globalAccessibilityUtils.cleanup();

      // Should attempt to remove live regions
      expect(mockRemoveChild).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty chart data gracefully', () => {
      const emptyData = { labels: [], datasets: [] };
      const description = generateChartDescription('line', emptyData);
      
      expect(description).toContain('line chart with 0 datasets and 0 data points');
    });

    it('should handle missing dataset labels', () => {
      const dataWithoutLabels = {
        labels: ['A', 'B'],
        datasets: [{ data: [1, 2] }, { data: [3, 4] }],
      };
      
      const description = generateChartDescription('pie', dataWithoutLabels);
      expect(description).toContain('pie chart with 2 datasets and 2 data points');
    });

    it('should handle URL without filename', () => {
      const altText = generateAltText('image', 'https://example.com/');
      expect(altText).toBe('Image: unknown');
    });

    it('should handle focus restoration with removed element', () => {
      const removedElement = createMockElement('button');
      document.contains = jest.fn().mockReturnValue(false);
      
      const focusManager = getFocusManager();
      
      // Should not throw error
      expect(() => {
        focusManager.restoreFocus(removedElement);
      }).not.toThrow();
      
      expect(removedElement.focus).not.toHaveBeenCalled();
    });
  });
});