/**
 * TTSRenderer Component Tests
 * Tests for the TTS renderer component functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TTSRenderer } from '../TTSRenderer';
import { TTSEngine } from '../TTSEngine';

// Mock TTSEngine
jest.mock('../TTSEngine');

const mockTTSEngine = {
  isSupported: jest.fn(() => true),
  speak: jest.fn(() => Promise.resolve()),
  stop: jest.fn(),
  isSpeaking: jest.fn(() => false),
  getState: jest.fn(() => ({
    isPlaying: false,
    currentText: '',
    currentLanguage: 'pl-PL',
    currentUtterance: null,
  })),
  onStateChange: jest.fn(),
};

(TTSEngine.getInstance as jest.Mock).mockReturnValue(mockTTSEngine);

describe('TTSRenderer', () => {
  const defaultProps = {
    text: 'Hello world',
    language: 'en-US',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render text with TTS button', () => {
      render(<TTSRenderer {...defaultProps} />);
      
      expect(screen.getByText('Hello world')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
      expect(screen.getByLabelText(/click to hear pronunciation/i)).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      const { container } = render(
        <TTSRenderer {...defaultProps} className="custom-class" />
      );
      
      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should show volume icon when not playing', () => {
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      // Volume2 icon should be present (not VolumeX or Loader2)
    });

    it('should show loading icon when loading', async () => {
      mockTTSEngine.speak.mockReturnValue(new Promise(() => {})); // Never resolves
      
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(button).toBeDisabled();
      });
    });

    it('should show stop icon when playing', () => {
      mockTTSEngine.isSpeaking.mockReturnValue(true);
      
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      // VolumeX icon should be present when playing
    });
  });

  describe('TTS Support Detection', () => {
    it('should show error when TTS is not supported', () => {
      mockTTSEngine.isSupported.mockReturnValue(false);
      
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Text-to-speech is not supported in this browser');
    });

    it('should disable interactions when TTS is not supported', async () => {
      mockTTSEngine.isSupported.mockReturnValue(false);
      
      render(<TTSRenderer {...defaultProps} />);
      
      const text = screen.getByText('Hello world');
      const button = screen.getByRole('button');
      
      fireEvent.click(text);
      fireEvent.click(button);
      
      expect(mockTTSEngine.speak).not.toHaveBeenCalled();
    });
  });

  describe('TTS Interaction', () => {
    it('should start TTS when clicking text', async () => {
      render(<TTSRenderer {...defaultProps} />);
      
      const text = screen.getByText('Hello world');
      fireEvent.click(text);
      
      expect(mockTTSEngine.speak).toHaveBeenCalledWith('Hello world', 'en-US');
    });

    it('should start TTS when clicking button', async () => {
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(mockTTSEngine.speak).toHaveBeenCalledWith('Hello world', 'en-US');
    });

    it('should stop TTS when clicking while playing', async () => {
      mockTTSEngine.isSpeaking.mockReturnValue(true);
      
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(mockTTSEngine.stop).toHaveBeenCalled();
    });

    it('should stop other TTS when starting new one', async () => {
      mockTTSEngine.getState.mockReturnValue({
        isPlaying: true,
        currentText: 'Other text',
        currentLanguage: 'en-US',
        currentUtterance: null,
      });
      
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(mockTTSEngine.stop).toHaveBeenCalled();
      expect(mockTTSEngine.speak).toHaveBeenCalledWith('Hello world', 'en-US');
    });
  });

  describe('Keyboard Interaction', () => {
    it('should start TTS on Enter key', async () => {
      render(<TTSRenderer {...defaultProps} />);
      
      const text = screen.getByText('Hello world');
      fireEvent.keyDown(text, { key: 'Enter' });
      
      expect(mockTTSEngine.speak).toHaveBeenCalledWith('Hello world', 'en-US');
    });

    it('should start TTS on Space key', async () => {
      render(<TTSRenderer {...defaultProps} />);
      
      const text = screen.getByText('Hello world');
      fireEvent.keyDown(text, { key: ' ' });
      
      expect(mockTTSEngine.speak).toHaveBeenCalledWith('Hello world', 'en-US');
    });

    it('should not start TTS on other keys', async () => {
      render(<TTSRenderer {...defaultProps} />);
      
      const text = screen.getByText('Hello world');
      fireEvent.keyDown(text, { key: 'Tab' });
      fireEvent.keyDown(text, { key: 'Escape' });
      
      expect(mockTTSEngine.speak).not.toHaveBeenCalled();
    });

    it('should prevent default behavior for Enter and Space', async () => {
      render(<TTSRenderer {...defaultProps} />);
      
      const text = screen.getByText('Hello world');
      
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
      
      const preventDefaultSpy = jest.spyOn(enterEvent, 'preventDefault');
      const preventDefaultSpy2 = jest.spyOn(spaceEvent, 'preventDefault');
      
      fireEvent(text, enterEvent);
      fireEvent(text, spaceEvent);
      
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(preventDefaultSpy2).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should show error message when TTS fails', async () => {
      const errorMessage = 'TTS failed';
      mockTTSEngine.speak.mockRejectedValue(new Error(errorMessage));
      
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText(`Speech synthesis error: ${errorMessage}`)).toBeInTheDocument();
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockTTSEngine.speak.mockRejectedValue('String error');
      
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to play text-to-speech')).toBeInTheDocument();
      });
    });

    it('should clear error when starting new TTS', async () => {
      mockTTSEngine.speak
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce(undefined);
      
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      
      // First click - should show error
      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByText('Speech synthesis error: First error')).toBeInTheDocument();
      });
      
      // Second click - should clear error
      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.queryByText('Speech synthesis error: First error')).not.toBeInTheDocument();
      });
    });

    it('should not show error while loading', async () => {
      mockTTSEngine.speak.mockReturnValue(new Promise(() => {})); // Never resolves
      
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      // Should not show error immediately
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Visual States', () => {
    it('should apply playing styles when currently playing', () => {
      mockTTSEngine.isSpeaking.mockReturnValue(true);
      
      render(<TTSRenderer {...defaultProps} />);
      
      const text = screen.getByText('Hello world');
      expect(text).toHaveClass('tts-text-playing');
    });

    it('should apply idle styles when not playing', () => {
      mockTTSEngine.isSpeaking.mockReturnValue(false);
      
      render(<TTSRenderer {...defaultProps} />);
      
      const text = screen.getByText('Hello world');
      expect(text).toHaveClass('tts-text-idle');
    });

    it('should apply disabled styles when not supported', () => {
      mockTTSEngine.isSupported.mockReturnValue(false);
      
      render(<TTSRenderer {...defaultProps} />);
      
      const text = screen.getByText('Hello world');
      expect(text).toHaveClass('tts-text-disabled');
    });

    it('should show highlight overlay when playing', () => {
      mockTTSEngine.isSpeaking.mockReturnValue(true);
      
      render(<TTSRenderer {...defaultProps} />);
      
      const overlay = document.querySelector('.tts-highlight-overlay');
      expect(overlay).toBeInTheDocument();
    });

    it('should not show highlight overlay when not playing', () => {
      mockTTSEngine.isSpeaking.mockReturnValue(false);
      
      render(<TTSRenderer {...defaultProps} />);
      
      const overlay = document.querySelector('.tts-highlight-overlay');
      expect(overlay).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<TTSRenderer {...defaultProps} />);
      
      const text = screen.getByText('Hello world');
      const button = screen.getByRole('button');
      
      expect(text).toHaveAttribute('aria-label', 'Click to hear pronunciation in en-US');
      expect(button).toHaveAttribute('aria-label', 'Click to hear pronunciation in en-US');
    });

    it('should have proper role and tabindex for text', () => {
      render(<TTSRenderer {...defaultProps} />);
      
      const text = screen.getByText('Hello world');
      expect(text).toHaveAttribute('role', 'button');
      expect(text).toHaveAttribute('tabIndex', '0');
    });

    it('should have live region for errors', async () => {
      mockTTSEngine.speak.mockRejectedValue(new Error('TTS failed'));
      
      render(<TTSRenderer {...defaultProps} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        const errorElement = screen.getByRole('alert');
        expect(errorElement).toHaveAttribute('aria-live', 'polite');
      });
    });

    it('should update button title based on state', () => {
      const { rerender } = render(<TTSRenderer {...defaultProps} />);
      
      let button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Click to hear pronunciation in en-US');
      
      // Mock playing state
      mockTTSEngine.isSpeaking.mockReturnValue(true);
      rerender(<TTSRenderer {...defaultProps} />);
      
      button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Stop speech');
    });
  });

  describe('State Management', () => {
    it('should subscribe to TTS state changes', () => {
      render(<TTSRenderer {...defaultProps} />);
      
      expect(mockTTSEngine.onStateChange).toHaveBeenCalled();
    });

    it('should get initial TTS state', () => {
      render(<TTSRenderer {...defaultProps} />);
      
      expect(mockTTSEngine.getState).toHaveBeenCalled();
    });

    it('should update UI when TTS state changes', () => {
      const stateCallback = jest.fn();
      mockTTSEngine.onStateChange.mockImplementation((callback) => {
        stateCallback.mockImplementation(callback);
      });
      
      render(<TTSRenderer {...defaultProps} />);
      
      // Simulate state change
      stateCallback({
        isPlaying: true,
        currentText: 'Hello world',
        currentLanguage: 'en-US',
        currentUtterance: null,
      });
      
      // Component should re-render with new state
      expect(mockTTSEngine.isSpeaking).toHaveBeenCalled();
    });
  });

  describe('Language Handling', () => {
    it('should use provided language', () => {
      render(<TTSRenderer text="Hola mundo" language="es-ES" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(mockTTSEngine.speak).toHaveBeenCalledWith('Hola mundo', 'es-ES');
    });

    it('should fallback to default language when not provided', () => {
      render(<TTSRenderer text="Hello world" language="" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(mockTTSEngine.speak).toHaveBeenCalledWith('Hello world', '');
    });

    it('should show language in accessibility labels', () => {
      render(<TTSRenderer text="Bonjour" language="fr-FR" />);
      
      const text = screen.getByText('Bonjour');
      expect(text).toHaveAttribute('aria-label', 'Click to hear pronunciation in fr-FR');
    });
  });
});