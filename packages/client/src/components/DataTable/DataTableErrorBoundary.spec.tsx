import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTableErrorBoundary } from './DataTableErrorBoundary';

// Mock the logger
jest.mock('~/utils', () => ({
  logger: {
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  RefreshCw: ({ className }: { className?: string }) => (
    <svg data-testid="refresh-icon" className={className} />
  ),
}));

// Mock the Button component
jest.mock('../Button', () => ({
  Button: ({
    children,
    onClick,
    variant,
    className,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    className?: string;
    'aria-label'?: string;
  }) => (
    <button
      onClick={onClick}
      data-variant={variant}
      className={className}
      aria-label={ariaLabel}
      data-testid="retry-button"
    >
      {children}
    </button>
  ),
}));

// Component that throws an error
const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div data-testid="child-content">Child content</div>;
};

// Suppress console.error for expected errors during tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DataTableErrorBoundary', () => {
  it('should render children when no error', () => {
    render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </DataTableErrorBoundary>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('should catch errors and display fallback UI', () => {
    render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should show error title', () => {
    render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    // The title comes from localize which returns the key
    expect(screen.getByText('com_ui_table_error')).toBeInTheDocument();
  });

  it('should show error description', () => {
    render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    expect(screen.getByText('com_ui_table_error_description')).toBeInTheDocument();
  });

  it('should render retry button', () => {
    render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    expect(screen.getByText('com_ui_retry')).toBeInTheDocument();
  });

  it('should reset error state when retry button is clicked', () => {
    const { rerender } = render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    // Error state should be shown
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // First rerender with non-throwing component (error boundary still shows fallback
    // because it hasn't reset yet)
    rerender(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </DataTableErrorBoundary>,
    );

    // Still showing error (because error boundary hasn't reset)
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Click retry to reset error boundary state
    fireEvent.click(screen.getByTestId('retry-button'));

    // Now children should render without throwing
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('should call onError callback with error', () => {
    const mockOnError = jest.fn();

    render(
      <DataTableErrorBoundary onError={mockOnError}>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    expect(mockOnError).toHaveBeenCalledTimes(1);
    expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
    expect(mockOnError.mock.calls[0][0].message).toBe('Test error message');
  });

  it('should call onReset callback on retry', () => {
    const mockOnReset = jest.fn();

    render(
      <DataTableErrorBoundary onReset={mockOnReset}>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    fireEvent.click(screen.getByTestId('retry-button'));

    expect(mockOnReset).toHaveBeenCalledTimes(1);
  });

  it('should have proper ARIA attributes on error card', () => {
    render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    const alertElement = screen.getByRole('alert');
    expect(alertElement).toHaveAttribute('aria-live', 'assertive');
    expect(alertElement).toHaveAttribute('aria-labelledby', 'datatable-error-title');
    expect(alertElement).toHaveAttribute('aria-describedby', 'datatable-error-desc');
  });

  it('should have proper id on title element', () => {
    render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    const title = screen.getByText('com_ui_table_error');
    expect(title).toHaveAttribute('id', 'datatable-error-title');
  });

  it('should have proper id on description element', () => {
    render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    const description = screen.getByText('com_ui_table_error_description');
    expect(description).toHaveAttribute('id', 'datatable-error-desc');
  });

  it('should render refresh icon in error state', () => {
    render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    const refreshIcons = screen.getAllByTestId('refresh-icon');
    expect(refreshIcons.length).toBeGreaterThanOrEqual(1);
  });

  it('should have aria-label on retry button', () => {
    render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    const retryButton = screen.getByTestId('retry-button');
    expect(retryButton).toHaveAttribute('aria-label', 'Retry loading table');
  });

  it('should render with outline variant button', () => {
    render(
      <DataTableErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    const retryButton = screen.getByTestId('retry-button');
    expect(retryButton).toHaveAttribute('data-variant', 'outline');
  });

  it('should handle multiple consecutive errors', () => {
    const mockOnError = jest.fn();

    const { rerender } = render(
      <DataTableErrorBoundary onError={mockOnError}>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    expect(mockOnError).toHaveBeenCalledTimes(1);

    // Reset and throw again
    fireEvent.click(screen.getByTestId('retry-button'));

    rerender(
      <DataTableErrorBoundary onError={mockOnError}>
        <ThrowingComponent shouldThrow={true} />
      </DataTableErrorBoundary>,
    );

    // Should have caught the error again
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should not call onError when no error occurs', () => {
    const mockOnError = jest.fn();

    render(
      <DataTableErrorBoundary onError={mockOnError}>
        <ThrowingComponent shouldThrow={false} />
      </DataTableErrorBoundary>,
    );

    expect(mockOnError).not.toHaveBeenCalled();
  });

  it('should handle children that return null', () => {
    const NullComponent = () => null;

    render(
      <DataTableErrorBoundary>
        <NullComponent />
      </DataTableErrorBoundary>,
    );

    // Should not show error state
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should handle nested children', () => {
    render(
      <DataTableErrorBoundary>
        <div>
          <span>Nested content</span>
          <ThrowingComponent shouldThrow={false} />
        </div>
      </DataTableErrorBoundary>,
    );

    expect(screen.getByText('Nested content')).toBeInTheDocument();
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });
});
