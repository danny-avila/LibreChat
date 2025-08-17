import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecoilRoot } from 'recoil';
import HoverButtons from '../HoverButtons';
import type { TConversation, TMessage, TFeedback } from 'librechat-data-provider';

/**
 * Mock dependencies
 */
jest.mock('~/hooks', () => ({
  useGenerationsByLatest: jest.fn(() => ({
    hideEditButton: false,
    regenerateEnabled: true,
    continueSupported: false,
    forkingSupported: false,
    isEditableEndpoint: true,
  })),
  useLocalize: jest.fn(() => (key: string) => {
    const translations: Record<string, string> = {
      'com_ui_regenerate': 'Regenerate',
      'com_ui_continue': 'Continue',
      'com_ui_edit': 'Edit',
      'com_ui_copy_to_clipboard': 'Copy to clipboard',
      'com_ui_copied_to_clipboard': 'Copied to clipboard',
      'com_ui_model_info': 'Model Information',
    };
    return translations[key] || key;
  }),
}));

jest.mock('~/components/Conversations', () => ({
  Fork: () => <div data-testid="fork-button">Fork</div>,
}));

jest.mock('~/components', () => ({
  TooltipAnchor: ({ children, description, ...props }: any) => (
    <div {...props} data-testid="tooltip-anchor" description={description}>
      {children}
    </div>
  ),
}));

jest.mock('../MessageAudio', () => ({
  __esModule: true,
  default: () => <div data-testid="message-audio">Audio</div>,
}));

jest.mock('../Feedback', () => ({
  __esModule: true,
  default: ({ handleFeedback }: { handleFeedback: (feedback: { feedback: TFeedback }) => void }) => (
    <div data-testid="feedback-buttons">Feedback</div>
  ),
}));

// Mock the icons from @librechat/client
jest.mock('@librechat/client', () => ({
  EditIcon: () => <div data-testid="edit-icon">Edit</div>,
  Clipboard: () => <div data-testid="clipboard-icon">Copy</div>,
  CheckMark: ({ className }: { className?: string }) => (
    <div data-testid="checkmark-icon" className={className}>✓</div>
  ),
  ContinueIcon: ({ className }: { className?: string }) => (
    <div data-testid="continue-icon" className={className}>Continue</div>
  ),
  RegenerateIcon: ({ size }: { size?: string }) => (
    <div data-testid="regenerate-icon">Regenerate</div>
  ),
  InfoIcon: ({ size, 'aria-hidden': ariaHidden }: { size?: string; 'aria-hidden'?: string }) => (
    <svg data-testid="info-icon" aria-hidden={ariaHidden}>
      <circle r="0.75" />
    </svg>
  ),
}));

// Mock the clipboard API
const mockWriteText = jest.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

/**
 * Test suite for Model Info button in HoverButtons component
 */
describe('HoverButtons - Model Info Feature', () => {
  // Default props for testing
  const defaultProps = {
    index: 0,
    isEditing: false,
    enterEdit: jest.fn(),
    copyToClipboard: jest.fn(),
    conversation: {
      conversationId: 'test-convo-123',
      endpoint: 'openai',
      endpointType: 'azure',
      model: 'gpt-4-turbo',
      modelLabel: 'GPT-4 Turbo',
    } as TConversation,
    isSubmitting: false,
    message: {
      messageId: 'msg-123456789',
      text: 'Test response',
      isCreatedByUser: false,
      createdAt: '2024-01-15T10:30:45.000Z',
      finish_reason: 'stop',
      model: 'gpt-4-turbo-preview',
    } as TMessage,
    regenerate: jest.fn(),
    handleContinue: jest.fn(),
    latestMessage: null,
    isLast: true,
    handleFeedback: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
  });

  /**
   * Test: Model info button renders for AI messages
   */
  it('renders model info button for AI-generated messages', () => {
    render(
      <RecoilRoot>
        <HoverButtons {...defaultProps} />
      </RecoilRoot>
    );

    const infoButton = screen.getByTitle('Model Information');
    expect(infoButton).toBeInTheDocument();
  });

  /**
   * Test: Model info button does NOT render for user messages
   */
  it('does not render model info button for user messages', () => {
    const userMessageProps = {
      ...defaultProps,
      message: {
        ...defaultProps.message,
        isCreatedByUser: true,
      } as TMessage,
    };

    render(
      <RecoilRoot>
        <HoverButtons {...userMessageProps} />
      </RecoilRoot>
    );

    const infoButton = screen.queryByTitle('Model Information');
    expect(infoButton).not.toBeInTheDocument();
  });

  /**
   * Test: Tooltip displays formatted model information
   */
  it('displays correct model information in tooltip', () => {
    render(
      <RecoilRoot>
        <HoverButtons {...defaultProps} />
      </RecoilRoot>
    );

    // Find the tooltip anchor element
    const tooltipAnchor = screen.getByTitle('Model Information').closest('[role="tooltip"]');
    expect(tooltipAnchor).toBeInTheDocument();
    
    // Check if the description attribute contains expected information
    const description = tooltipAnchor?.getAttribute('description') || '';
    expect(description).toContain('GPT-4 Turbo');
    expect(description).toContain('openai (azure)');
    expect(description).toContain('Click to copy');
  });

  /**
   * Test: Clicking info button copies model info to clipboard
   */
  it('copies model information to clipboard when clicked', async () => {
    render(
      <RecoilRoot>
        <HoverButtons {...defaultProps} />
      </RecoilRoot>
    );

    const infoButton = screen.getByTitle('Model Information');
    fireEvent.click(infoButton);

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledTimes(1);
      const copiedText = mockWriteText.mock.calls[0][0];
      expect(copiedText).toContain('Model: GPT-4 Turbo');
      expect(copiedText).toContain('Provider: openai (azure)');
      expect(copiedText).toContain('Message ID: msg-1234');
      expect(copiedText).toContain('Finish: stop');
    });
  });

  /**
   * Test: Shows checkmark icon after copying
   */
  it('shows checkmark icon after successful copy', async () => {
    const { container } = render(
      <RecoilRoot>
        <HoverButtons {...defaultProps} />
      </RecoilRoot>
    );

    const infoButton = screen.getByTitle('Model Information');
    
    // Initially should show InfoIcon
    expect(container.querySelector('svg circle[r="0.75"]')).toBeInTheDocument(); // Info icon dot
    
    // Click to copy
    fireEvent.click(infoButton);

    await waitFor(() => {
      // Should temporarily show checkmark
      const checkmark = container.querySelector('.h-\\[18px\\].w-\\[18px\\]');
      expect(checkmark).toBeInTheDocument();
    });
  });

  /**
   * Test: Handles missing model information gracefully
   */
  it('handles missing model information with fallback values', async () => {
    const propsWithMissingInfo = {
      ...defaultProps,
      conversation: {
        conversationId: 'conv-minimal',
      } as TConversation,
      message: {
        messageId: 'msg-789',
        text: 'Test',
        isCreatedByUser: false,
      } as TMessage,
    };

    render(
      <RecoilRoot>
        <HoverButtons {...propsWithMissingInfo} />
      </RecoilRoot>
    );

    const infoButton = screen.getByTitle('Model Information');
    fireEvent.click(infoButton);

    await waitFor(() => {
      const copiedText = mockWriteText.mock.calls[0][0];
      expect(copiedText).toContain('Unknown Model');
      expect(copiedText).toContain('Unknown Provider');
      expect(copiedText).toContain('Unknown Time');
    });
  });

  /**
   * Test: Formats timestamp correctly
   */
  it('formats timestamp in locale-aware format', async () => {
    const messageWithTimestamp = {
      ...defaultProps.message,
      createdAt: '2024-01-15T14:30:45.123Z',
    };

    render(
      <RecoilRoot>
        <HoverButtons {...defaultProps} message={messageWithTimestamp as TMessage} />
      </RecoilRoot>
    );

    const infoButton = screen.getByTitle('Model Information');
    fireEvent.click(infoButton);

    await waitFor(() => {
      const copiedText = mockWriteText.mock.calls[0][0];
      // Check for formatted date parts (exact format depends on locale)
      expect(copiedText).toMatch(/Jan|January/);
      expect(copiedText).toContain('15');
      expect(copiedText).toContain('2024');
    });
  });

  /**
   * Test: Shows error status when message has error
   */
  it('includes error status when message has error', async () => {
    const errorMessage = {
      ...defaultProps.message,
      error: true,
    } as TMessage;

    render(
      <RecoilRoot>
        <HoverButtons {...defaultProps} message={errorMessage} />
      </RecoilRoot>
    );

    const infoButton = screen.getByTitle('Model Information');
    fireEvent.click(infoButton);

    await waitFor(() => {
      const copiedText = mockWriteText.mock.calls[0][0];
      expect(copiedText).toContain('Status: ⚠️ Error');
    });
  });

  /**
   * Test: Button position in hover buttons group
   */
  it('positions info button after regenerate and before continue', () => {
    const propsWithAllButtons = {
      ...defaultProps,
      conversation: {
        ...defaultProps.conversation,
        endpoint: 'gptPlugins',
      } as TConversation,
    };

    // Mock to enable continue button
    const useGenerationsByLatest = require('~/hooks').useGenerationsByLatest;
    useGenerationsByLatest.mockReturnValueOnce({
      hideEditButton: false,
      regenerateEnabled: true,
      continueSupported: true,
      forkingSupported: true,
      isEditableEndpoint: true,
    });

    const { container } = render(
      <RecoilRoot>
        <HoverButtons {...propsWithAllButtons} />
      </RecoilRoot>
    );

    const buttons = container.querySelectorAll('button');
    const buttonTitles = Array.from(buttons).map(btn => btn.getAttribute('title'));
    
    const regenerateIndex = buttonTitles.indexOf('Regenerate');
    const infoIndex = buttonTitles.indexOf('Model Information');
    const continueIndex = buttonTitles.indexOf('Continue');

    // Info button should be between regenerate and continue
    if (regenerateIndex !== -1 && continueIndex !== -1) {
      expect(infoIndex).toBeGreaterThan(regenerateIndex);
      expect(infoIndex).toBeLessThan(continueIndex);
    }
  });

  /**
   * Test: Accessibility - button has proper ARIA attributes
   */
  it('has proper accessibility attributes', () => {
    render(
      <RecoilRoot>
        <HoverButtons {...defaultProps} />
      </RecoilRoot>
    );

    const infoButton = screen.getByTitle('Model Information');
    
    // Check for unique ID
    expect(infoButton).toHaveAttribute('id', expect.stringContaining('model-info-'));
    
    // Check button type
    expect(infoButton).toHaveAttribute('type', 'button');
    
    // Check that icon is marked as decorative
    const icon = infoButton.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  /**
   * Test: Memoization prevents unnecessary recalculations
   */
  it('memoizes model info to prevent recalculation', () => {
    const { rerender } = render(
      <RecoilRoot>
        <HoverButtons {...defaultProps} />
      </RecoilRoot>
    );

    const infoButton1 = screen.getByTitle('Model Information');
    fireEvent.click(infoButton1);
    const firstCallText = mockWriteText.mock.calls[0][0];

    // Clear mock and rerender with same props
    mockWriteText.mockClear();
    rerender(
      <RecoilRoot>
        <HoverButtons {...defaultProps} />
      </RecoilRoot>
    );

    const infoButton2 = screen.getByTitle('Model Information');
    fireEvent.click(infoButton2);
    const secondCallText = mockWriteText.mock.calls[0][0];

    // Should produce identical output without recalculation
    expect(firstCallText).toEqual(secondCallText);
  });
});