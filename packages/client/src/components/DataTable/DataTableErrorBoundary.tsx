import { Component, ErrorInfo, ReactNode, createRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../Button';
import { logger } from '~/utils';
import { useLocalize } from '~/hooks';

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
interface DataTableErrorBoundaryInnerProps extends DataTableErrorBoundaryProps {
  localize: ReturnType<typeof useLocalize>;
}

class DataTableErrorBoundaryInner extends Component<
  DataTableErrorBoundaryInnerProps,
  DataTableErrorBoundaryState
> {
  private errorCardRef = createRef<HTMLDivElement>();

  constructor(props: DataTableErrorBoundaryInnerProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): DataTableErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('DataTable Error Boundary caught an error:', error, errorInfo);
    this.props.onError?.(error);
  }

  componentDidUpdate(
    _prevProps: DataTableErrorBoundaryInnerProps,
    prevState: DataTableErrorBoundaryState,
  ) {
    if (!prevState.hasError && this.state.hasError && this.errorCardRef.current) {
      this.errorCardRef.current.focus();
    }
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
      return (
        <div className="flex h-full w-full flex-col items-center justify-center p-8">
          <div
            ref={this.errorCardRef}
            role="alert"
            aria-live="assertive"
            aria-labelledby="datatable-error-title"
            aria-describedby="datatable-error-desc"
            tabIndex={-1}
            className="before:bg-surface-destructive/80 relative w-full max-w-md overflow-hidden rounded-lg border border-border-light bg-surface-primary-alt p-6 shadow-sm outline-none before:absolute before:left-0 before:top-0 before:h-full before:w-1 focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:border-border-medium dark:bg-surface-secondary"
          >
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-surface-destructive" />
              <h3 id="datatable-error-title" className="text-sm font-medium text-text-primary">
                {this.props.localize('com_ui_table_error')}
              </h3>
            </div>
            <p id="datatable-error-desc" className="mt-2 text-sm text-text-secondary">
              {this.props.localize('com_ui_table_error_description')}
            </p>
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={this.handleReset}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-hover dark:hover:bg-surface-active"
                aria-label="Retry loading table"
              >
                <RefreshCw className="h-3 w-3" />
                {this.props.localize('com_ui_retry')}
              </Button>
            </div>
          </div>

          {import.meta.env.MODE === 'development' && this.state.error && (
            <details className="mt-4 max-w-md rounded-md bg-surface-secondary p-3 text-xs dark:bg-surface-tertiary">
              <summary className="cursor-pointer font-medium text-text-primary">
                {this.props.localize('com_ui_error_details')}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-text-secondary">
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

export function DataTableErrorBoundary(props: DataTableErrorBoundaryProps) {
  const localize = useLocalize();
  return <DataTableErrorBoundaryInner {...props} localize={localize} />;
}

export default DataTableErrorBoundary;
