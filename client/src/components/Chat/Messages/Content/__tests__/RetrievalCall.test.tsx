import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import RetrievalCall from '../RetrievalCall';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_ui_searching_files: 'Searching files...',
      com_ui_retrieved_files: 'Retrieved files',
      com_ui_retrieval_failed: 'failed',
      com_ui_tool_failed: 'failed',
    };
    return translations[key] || key;
  },
  useProgress: (initialProgress: number) => (initialProgress >= 1 ? 1 : initialProgress),
  useExpandCollapse: (isExpanded: boolean) =>
    isExpanded
      ? { display: 'grid', gridTemplateRows: '1fr', opacity: 1 }
      : { display: 'grid', gridTemplateRows: '0fr', opacity: 0 },
}));

jest.mock('../ProgressText', () => ({
  __esModule: true,
  default: ({
    onClick,
    inProgressText,
    finishedText,
    icon,
    hasInput,
    isExpanded,
    error,
    errorSuffix,
  }: {
    onClick?: () => void;
    inProgressText: string;
    finishedText: string;
    icon?: React.ReactNode;
    hasInput?: boolean;
    isExpanded?: boolean;
    error?: boolean;
    errorSuffix?: string;
  }) => (
    <div
      onClick={onClick}
      data-testid="progress-text"
      data-in-progress={inProgressText}
      data-finished={finishedText}
      data-has-input={hasInput}
      data-expanded={isExpanded}
      data-error={error}
      data-error-suffix={errorSuffix}
    >
      {icon}
      {finishedText || inProgressText}
    </div>
  ),
}));

jest.mock('../ToolOutput', () => ({
  ToolIcon: ({ type, isAnimating }: { type: string; isAnimating?: boolean }) => (
    <span data-testid="tool-icon" data-type={type} data-animating={isAnimating} />
  ),
  OutputRenderer: ({ text }: { text: string }) => <pre data-testid="output-renderer">{text}</pre>,
  isError: (output: string) => typeof output === 'string' && output.toLowerCase().includes('error'),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' '),
  logger: { error: jest.fn(), debug: jest.fn() },
}));

const defaultProps = {
  initialProgress: 1,
  isSubmitting: false,
};

const renderRetrievalCall = (props: Partial<typeof defaultProps & { output?: string }> = {}) =>
  render(
    <RecoilRoot>
      <RetrievalCall {...defaultProps} {...props} />
    </RecoilRoot>,
  );

describe('RetrievalCall - LGCY-02: Modern visual patterns', () => {
  it('renders ToolIcon with type="file_search"', () => {
    renderRetrievalCall({ initialProgress: 1, isSubmitting: false });

    const icon = screen.getByTestId('tool-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('data-type', 'file_search');
  });

  it('does not render ProgressCircle', () => {
    renderRetrievalCall();

    expect(screen.queryByTestId('progress-circle')).not.toBeInTheDocument();
  });

  it('does not render InProgressCall', () => {
    renderRetrievalCall();

    expect(screen.queryByTestId('in-progress-call')).not.toBeInTheDocument();
  });

  it('does not render RetrievalIcon', () => {
    renderRetrievalCall();

    expect(screen.queryByTestId('retrieval-icon')).not.toBeInTheDocument();
  });
});

describe('RetrievalCall - LGCY-02: Collapsible output panel', () => {
  it('shows collapsible panel when output exists and is clicked', () => {
    renderRetrievalCall({
      output: 'file results here',
      initialProgress: 1,
      isSubmitting: false,
    });

    const progressText = screen.getByTestId('progress-text');
    fireEvent.click(progressText);

    expect(screen.getByText('file results here')).toBeInTheDocument();
  });

  it('does not show panel when output is undefined', () => {
    renderRetrievalCall({ initialProgress: 1, isSubmitting: false });

    expect(screen.queryByText('file results here')).not.toBeInTheDocument();
  });

  it('does not show panel when output contains error', () => {
    renderRetrievalCall({
      output: 'error processing tool',
      initialProgress: 1,
      isSubmitting: false,
    });

    expect(screen.queryByText('error processing tool')).not.toBeInTheDocument();
  });
});

describe('RetrievalCall - LGCY-03: Localization', () => {
  it('uses localized in-progress text', () => {
    renderRetrievalCall({ initialProgress: 0.5, isSubmitting: true });

    const progressText = screen.getByTestId('progress-text');
    expect(progressText).toHaveAttribute('data-in-progress', 'Searching files...');
  });

  it('uses localized finished text', () => {
    renderRetrievalCall({ initialProgress: 1, isSubmitting: false });

    const progressText = screen.getByTestId('progress-text');
    expect(progressText).toHaveAttribute('data-finished', 'Retrieved files');
  });

  it('does not contain hardcoded "Searching my knowledge" text', () => {
    const { container } = renderRetrievalCall({ initialProgress: 0.5, isSubmitting: true });

    expect(container.textContent).not.toContain('Searching my knowledge');
  });

  it('does not contain hardcoded "Used Retrieval" text', () => {
    const { container } = renderRetrievalCall({ initialProgress: 1, isSubmitting: false });

    expect(container.textContent).not.toContain('Used Retrieval');
  });
});

describe('RetrievalCall - A11Y-04: screen reader status announcements', () => {
  it('includes sr-only aria-live region for status announcements', () => {
    renderRetrievalCall({
      initialProgress: 1,
      isSubmitting: false,
      output: 'files found',
    });

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion!.className).toContain('sr-only');
  });
});
