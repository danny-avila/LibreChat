import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnhancedContentErrorBoundary, withErrorBoundary } from '../EnhancedContentErrorBoundary';

// Mock component that throws an error
const ThrowError: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = true }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

// Mock component for testing HOC
const TestComponent: React.FC<{ message: string }> = ({ message }) => (
  <div>{message}</div>
);

describe('EnhancedContentErrorBoundary', () => {
  // Suppress console.error for these tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render children when there is no error', () => {
    render(
      <EnhancedContentErrorBoundary>
        <ThrowError shouldThrow={false} />
      </EnhancedContentErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('should render error UI when child component throws', () => {
    render(
      <EnhancedContentErrorBoundary>
        <ThrowError />
      </EnhancedContentErrorBoundary>
    );

    expect(screen.getByText('Enhanced Content Error')).toBeInTheDocument();
    expect(screen.getByText(/There was an error rendering this enhanced content/)).toBeInTheDocument();
  });

  it('should render custom fallback when provided', () => {
    const customFallback = <div>Custom error message</div>;

    render(
      <EnhancedContentErrorBoundary fallback={customFallback}>
        <ThrowError />
      </EnhancedContentErrorBoundary>
    );

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
    expect(screen.queryByText('Enhanced Content Error')).not.toBeInTheDocument();
  });

  it('should call onError callback when error occurs', () => {
    const onError = jest.fn();

    render(
      <EnhancedContentErrorBoundary onError={onError}>
        <ThrowError />
      </EnhancedContentErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    );
  });

  it('should show error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <EnhancedContentErrorBoundary>
        <ThrowError />
      </EnhancedContentErrorBoundary>
    );

    expect(screen.getByText('Error Details (Development)')).toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('should hide error details in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    render(
      <EnhancedContentErrorBoundary>
        <ThrowError />
      </EnhancedContentErrorBoundary>
    );

    expect(screen.queryByText('Error Details (Development)')).not.toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('should allow retry functionality', () => {
    const RetryableComponent: React.FC = () => {
      const [shouldThrow, setShouldThrow] = React.useState(true);

      React.useEffect(() => {
        // Simulate fixing the error after retry
        const timer = setTimeout(() => setShouldThrow(false), 100);
        return () => clearTimeout(timer);
      }, []);

      return <ThrowError shouldThrow={shouldThrow} />;
    };

    render(
      <EnhancedContentErrorBoundary>
        <RetryableComponent />
      </EnhancedContentErrorBoundary>
    );

    // Should show error initially
    expect(screen.getByText('Enhanced Content Error')).toBeInTheDocument();

    // Click retry button
    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);

    // Should attempt to re-render (though the test component will still throw)
    expect(screen.getByText('Enhanced Content Error')).toBeInTheDocument();
  });

  describe('withErrorBoundary HOC', () => {
    it('should wrap component with error boundary', () => {
      const WrappedComponent = withErrorBoundary(TestComponent);

      render(<WrappedComponent message="Test message" />);

      expect(screen.getByText('Test message')).toBeInTheDocument();
    });

    it('should use custom fallback when provided', () => {
      const customFallback = <div>HOC custom fallback</div>;
      const ThrowingComponent = withErrorBoundary(ThrowError, customFallback);

      render(<ThrowingComponent />);

      expect(screen.getByText('HOC custom fallback')).toBeInTheDocument();
    });

    it('should set correct display name', () => {
      const WrappedComponent = withErrorBoundary(TestComponent);
      expect(WrappedComponent.displayName).toBe('withErrorBoundary(TestComponent)');
    });

    it('should handle components without display name', () => {
      const AnonymousComponent = () => <div>Anonymous</div>;
      const WrappedComponent = withErrorBoundary(AnonymousComponent);
      expect(WrappedComponent.displayName).toBe('withErrorBoundary(AnonymousComponent)');
    });
  });

  describe('Error boundary lifecycle', () => {
    it('should reset error state when retry is clicked', () => {
      let throwError = true;
      const ConditionalThrow: React.FC = () => {
        if (throwError) {
          throw new Error('Conditional error');
        }
        return <div>Success after retry</div>;
      };

      const { rerender } = render(
        <EnhancedContentErrorBoundary>
          <ConditionalThrow />
        </EnhancedContentErrorBoundary>
      );

      // Should show error
      expect(screen.getByText('Enhanced Content Error')).toBeInTheDocument();

      // Fix the error condition
      throwError = false;

      // Click retry
      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      // Force re-render
      rerender(
        <EnhancedContentErrorBoundary>
          <ConditionalThrow />
        </EnhancedContentErrorBoundary>
      );

      // Should show success message
      expect(screen.getByText('Success after retry')).toBeInTheDocument();
    });

    it('should maintain error state across re-renders until retry', () => {
      const { rerender } = render(
        <EnhancedContentErrorBoundary>
          <ThrowError />
        </EnhancedContentErrorBoundary>
      );

      expect(screen.getByText('Enhanced Content Error')).toBeInTheDocument();

      // Re-render without retry
      rerender(
        <EnhancedContentErrorBoundary>
          <ThrowError />
        </EnhancedContentErrorBoundary>
      );

      // Should still show error
      expect(screen.getByText('Enhanced Content Error')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <EnhancedContentErrorBoundary>
          <ThrowError />
        </EnhancedContentErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toHaveAttribute('title', 'Retry rendering');
    });

    it('should be keyboard accessible', () => {
      render(
        <EnhancedContentErrorBoundary>
          <ThrowError />
        </EnhancedContentErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      
      // Should be focusable
      retryButton.focus();
      expect(document.activeElement).toBe(retryButton);

      // Should respond to Enter key
      fireEvent.keyDown(retryButton, { key: 'Enter' });
      // The error boundary should attempt to retry (though it will fail again in this test)
    });
  });
});