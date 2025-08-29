/**
 * Basic Accessibility Tests
 * 
 * Simple accessibility tests for enhanced content components
 * focusing on ARIA attributes and keyboard navigation.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TTSRenderer } from '../TTSRenderer';

// Mock TTSEngine
jest.mock('../TTSEngine', () => ({
  TTSEngine: {
    getInstance: () => ({
      isSupported: () => true,
      isSpeaking: () => false,
      speak: jest.fn(),
      stop: jest.fn(),
      onStateChange: jest.fn(),
      getState: () => ({
        isPlaying: false,
        currentText: '',
        currentLanguage: '',
        currentUtterance: null,
      }),
    }),
  },
}));

// Mock Web Speech API
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: jest.fn(),
    cancel: jest.fn(),
    getVoices: jest.fn(() => []),
  },
  writable: true,
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: jest.fn(),
  writable: true,
});

describe('Basic Accessibility Tests', () => {
  const user = userEvent.setup();

  describe('TTS Renderer Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      render(<TTSRenderer text="Hello world" language="en-US" />);

      const textElement = screen.getByText('Hello world');
      const buttonElement = screen.getByRole('button');

      expect(textElement).toHaveAttribute('role', 'button');
      expect(textElement).toHaveAttribute('tabIndex', '0');
      expect(textElement).toHaveAttribute('aria-label');
      expect(buttonElement).toHaveAttribute('aria-label');
    });

    it('should support keyboard navigation', async () => {
      render(<TTSRenderer text="Hello world" language="en-US" />);

      const textElement = screen.getByText('Hello world');
      
      // Focus the element
      textElement.focus();
      expect(textElement).toHaveFocus();

      // Test Enter key
      await user.keyboard('{Enter}');
      // Should trigger TTS (mocked)

      // Test Space key
      await user.keyboard(' ');
      // Should trigger TTS (mocked)
    });

    it('should have proper button attributes', () => {
      render(<TTSRenderer text="Test text" language="en-US" />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveAttribute('aria-label');
      expect(button).toHaveAttribute('title');
    });
  });

  describe('Error States Accessibility', () => {
    it('should announce errors to screen readers', () => {
      const mockTTSEngine = {
        isSupported: () => false,
        isSpeaking: () => false,
        speak: jest.fn(),
        stop: jest.fn(),
        onStateChange: jest.fn(),
        getState: () => ({
          isPlaying: false,
          currentText: '',
          currentLanguage: '',
          currentUtterance: null,
        }),
      };

      jest.doMock('../TTSEngine', () => ({
        TTSEngine: {
          getInstance: () => mockTTSEngine,
        },
      }));

      render(<TTSRenderer text="Hello world" language="en-US" />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Text-to-speech is not supported in this browser');
    });
  });

  describe('Focus Management', () => {
    it('should handle focus correctly', () => {
      render(<TTSRenderer text="Focus test" language="en-US" />);

      const textElement = screen.getByText('Focus test');
      const buttonElement = screen.getByRole('button');

      // Both elements should be focusable
      textElement.focus();
      expect(textElement).toHaveFocus();

      buttonElement.focus();
      expect(buttonElement).toHaveFocus();
    });

    it('should have correct tab order', () => {
      render(
        <div>
          <TTSRenderer text="First" language="en-US" />
          <TTSRenderer text="Second" language="en-US" />
        </div>
      );

      const firstText = screen.getByText('First');
      const firstButton = screen.getAllByRole('button')[0];
      const secondText = screen.getByText('Second');
      const secondButton = screen.getAllByRole('button')[1];

      // Check tab indices
      expect(firstText).toHaveAttribute('tabIndex', '0');
      expect(firstButton).not.toHaveAttribute('tabIndex', '-1');
      expect(secondText).toHaveAttribute('tabIndex', '0');
      expect(secondButton).not.toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('Screen Reader Support', () => {
    it('should provide descriptive labels', () => {
      render(<TTSRenderer text="Screen reader test" language="fr-FR" />);

      const textElement = screen.getByText('Screen reader test');
      const buttonElement = screen.getByRole('button');

      const textLabel = textElement.getAttribute('aria-label');
      const buttonLabel = buttonElement.getAttribute('aria-label');

      expect(textLabel).toContain('fr-FR');
      expect(buttonLabel).toContain('fr-FR');
      expect(textLabel).toContain('pronunciation');
      expect(buttonLabel).toContain('pronunciation');
    });

    it('should update labels based on state', () => {
      const mockTTSEngine = {
        isSupported: () => true,
        isSpeaking: (text?: string) => text === 'Playing text',
        speak: jest.fn(),
        stop: jest.fn(),
        onStateChange: jest.fn(),
        getState: () => ({
          isPlaying: true,
          currentText: 'Playing text',
          currentLanguage: 'en-US',
          currentUtterance: null,
        }),
      };

      jest.doMock('../TTSEngine', () => ({
        TTSEngine: {
          getInstance: () => mockTTSEngine,
        },
      }));

      render(<TTSRenderer text="Playing text" language="en-US" />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Stop speech');
    });
  });
});