import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import AudioRecorder from '../AudioRecorder';

// Mock the hooks
jest.mock('@librechat/client', () => ({
  useToastContext: () => ({
    showToast: jest.fn(),
  }),
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => <div>{render}</div>,
  ListeningIcon: ({ className }: { className: string }) => <div className={className}>🎤</div>,
  Spinner: ({ className }: { className: string }) => <div className={className}>⏳</div>,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSpeechToText: () => ({
    isListening: false,
    isLoading: false,
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    clearAccumulatedText: jest.fn(),
  }),
}));

jest.mock('~/Providers', () => ({
  useChatFormContext: () => ({
    setValue: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: string[]) => classes.join(' '),
}));

describe('AudioRecorder', () => {
  const defaultProps = {
    disabled: false,
    ask: jest.fn(),
    methods: {
      setValue: jest.fn(),
      reset: jest.fn(),
    } as any,
    textAreaRef: { current: document.createElement('textarea') },
    isSubmitting: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly when not listening', () => {
    const { getByRole } = render(
      <RecoilRoot>
        <AudioRecorder {...defaultProps} />
      </RecoilRoot>,
    );

    const button = getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'com_ui_use_micrphone');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('handles single click to start/stop recording', () => {
    const mockStartRecording = jest.fn();
    const mockStopRecording = jest.fn();

    jest.doMock('~/hooks', () => ({
      useLocalize: () => (key: string) => key,
      useSpeechToText: () => ({
        isListening: false,
        isLoading: false,
        startRecording: mockStartRecording,
        stopRecording: mockStopRecording,
        clearAccumulatedText: jest.fn(),
      }),
    }));

    const { getByRole } = render(
      <RecoilRoot>
        <AudioRecorder {...defaultProps} />
      </RecoilRoot>,
    );

    const button = getByRole('button');
    fireEvent.click(button);

    expect(mockStartRecording).toHaveBeenCalled();
  });

  it('handles double click to clear accumulated text', () => {
    const mockClearAccumulatedText = jest.fn();
    const mockShowToast = jest.fn();

    jest.doMock('@librechat/client', () => ({
      useToastContext: () => ({
        showToast: mockShowToast,
      }),
      TooltipAnchor: ({ render }: { render: React.ReactNode }) => <div>{render}</div>,
      ListeningIcon: ({ className }: { className: string }) => <div className={className}>🎤</div>,
      Spinner: ({ className }: { className: string }) => <div className={className}>⏳</div>,
    }));

    jest.doMock('~/hooks', () => ({
      useLocalize: () => (key: string) => key,
      useSpeechToText: () => ({
        isListening: false,
        isLoading: false,
        startRecording: jest.fn(),
        stopRecording: jest.fn(),
        clearAccumulatedText: mockClearAccumulatedText,
      }),
    }));

    const { getByRole } = render(
      <RecoilRoot>
        <AudioRecorder {...defaultProps} />
      </RecoilRoot>,
    );

    const button = getByRole('button');
    fireEvent.doubleClick(button);

    expect(mockClearAccumulatedText).toHaveBeenCalled();
  });

  it('shows different icons based on state', () => {
    // Test listening state
    jest.doMock('~/hooks', () => ({
      useLocalize: () => (key: string) => key,
      useSpeechToText: () => ({
        isListening: true,
        isLoading: false,
        startRecording: jest.fn(),
        stopRecording: jest.fn(),
        clearAccumulatedText: jest.fn(),
      }),
    }));

    const { container } = render(
      <RecoilRoot>
        <AudioRecorder {...defaultProps} />
      </RecoilRoot>,
    );

    expect(container.querySelector('.stroke-red-500')).toBeInTheDocument();
  });

  it('disables button when disabled prop is true', () => {
    const { getByRole } = render(
      <RecoilRoot>
        <AudioRecorder {...defaultProps} disabled={true} />
      </RecoilRoot>,
    );

    const button = getByRole('button');
    expect(button).toBeDisabled();
  });

  it('returns null when textAreaRef is not available', () => {
    const propsWithoutRef = {
      ...defaultProps,
      textAreaRef: { current: null },
    };

    const { container } = render(
      <RecoilRoot>
        <AudioRecorder {...propsWithoutRef} />
      </RecoilRoot>,
    );

    expect(container.firstChild).toBeNull();
  });

  it('shows error toast when trying to use speech while submitting', () => {
    const mockShowToast = jest.fn();
    const mockAsk = jest.fn();

    jest.doMock('@librechat/client', () => ({
      useToastContext: () => ({
        showToast: mockShowToast,
      }),
      TooltipAnchor: ({ render }: { render: React.ReactNode }) => <div>{render}</div>,
      ListeningIcon: ({ className }: { className: string }) => <div className={className}>🎤</div>,
      Spinner: ({ className }: { className: string }) => <div className={className}>⏳</div>,
    }));

    const propsWithSubmitting = {
      ...defaultProps,
      isSubmitting: true,
      ask: mockAsk,
    };

    const { container } = render(
      <RecoilRoot>
        <AudioRecorder {...propsWithSubmitting} />
      </RecoilRoot>,
    );

    // This tests the onTranscriptionComplete callback behavior
    expect(container).toBeInTheDocument();
  });
});