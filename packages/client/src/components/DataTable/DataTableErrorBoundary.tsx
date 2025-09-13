import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '../Button';
import { RefreshCw } from 'lucide-react';

/**
 * Error boundary specifically for DataTable component.
 * Catches JavaScript errors in the table rendering and provides a fallback UI.
 * Handles errors from virtualizer, cell renderers, fetch operations, and child components.
 */
interface DataTableErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface DataTableErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error) => void;
  onReset?: () => void;
}

export class DataTableErrorBoundary extends Component<
  DataTableErrorBoundaryProps,
  DataTableErrorBoundaryState
> {
  constructor(props: DataTableErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): DataTableErrorBoundaryState {
    // Update state to show fallback UI and store error for logging
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error (you can also log to an error reporting service)
    console.error('DataTable Error Boundary caught an error:', error, errorInfo);

    // Call parent error handler if provided
    this.props.onError?.(error);
  }

  /**
   * Reset the error state and attempt to re-render the children.
   * This can be used to retry after a table error (e.g., network retry).
   */
  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI for DataTable errors
      return (
        <div className="flex h-full w-full flex-col items-center justify-center p-8">
          <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm dark:border-red-800 dark:bg-red-950/20">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <RefreshCw className="h-4 w-4" />
              <h3 className="text-sm font-medium">Table Error</h3>
            </div>
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">
              Table failed to load. Please refresh or try again.
            </p>
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={this.handleReset}
                className="flex items-center gap-2 border-red-300 bg-red-50 px-3 py-1.5 text-sm hover:bg-red-100 dark:border-red-700 dark:bg-red-950/20 dark:hover:bg-red-900/20"
                aria-label="Retry loading table"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            </div>
          </div>

          {/* Optional: Show technical error details in development */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-4 max-w-md rounded-md bg-gray-100 p-3 text-xs dark:bg-gray-800">
              <summary className="cursor-pointer font-medium text-gray-900 dark:text-gray-100">
                Error Details (Dev)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// Named export for convenience
export default DataTableErrorBoundary;
