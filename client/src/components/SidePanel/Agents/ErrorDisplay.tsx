import React from 'react';

import { useLocalize } from '~/hooks';
import { Button } from '~/components/ui';
import { cn } from '~/utils';

// Comprehensive error type that handles all possible error structures
type ApiError =
  | string
  | Error
  | {
      message?: string;
      status?: number;
      code?: string;
      response?: {
        data?: {
          userMessage?: string;
          suggestion?: string;
          message?: string;
        };
        status?: number;
      };
      data?: {
        userMessage?: string;
        suggestion?: string;
        message?: string;
      };
    };

interface ErrorDisplayProps {
  error: ApiError;
  onRetry?: () => void;
  context?: {
    searchQuery?: string;
    category?: string;
  };
}

/**
 * User-friendly error display component with actionable suggestions
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onRetry, context }) => {
  const localize = useLocalize();

  // Type guards
  const isErrorObject = (err: ApiError): err is { [key: string]: unknown } => {
    return typeof err === 'object' && err !== null && !(err instanceof Error);
  };

  const isErrorInstance = (err: ApiError): err is Error => {
    return err instanceof Error;
  };

  // Extract user-friendly error information
  const getErrorInfo = (): { title: string; message: string; suggestion: string } => {
    // Handle different error types
    let errorData: unknown;

    if (typeof error === 'string') {
      errorData = { message: error };
    } else if (isErrorInstance(error)) {
      errorData = { message: error.message };
    } else if (isErrorObject(error)) {
      // Handle axios error response structure
      errorData = (error as any)?.response?.data || (error as any)?.data || error;
    } else {
      errorData = error;
    }

    // Handle network errors first
    let errorMessage = '';
    if (isErrorInstance(error)) {
      errorMessage = error.message;
    } else if (isErrorObject(error) && (error as any)?.message) {
      errorMessage = (error as any).message;
    }

    const errorCode = isErrorObject(error) ? (error as any)?.code : '';

    // Handle timeout errors specifically
    if (errorCode === 'ECONNABORTED' || errorMessage?.includes('timeout')) {
      return {
        title: localize('com_agents_error_timeout_title'),
        message: localize('com_agents_error_timeout_message'),
        suggestion: localize('com_agents_error_timeout_suggestion'),
      };
    }

    if (errorCode === 'NETWORK_ERROR' || errorMessage?.includes('Network Error')) {
      return {
        title: localize('com_agents_error_network_title'),
        message: localize('com_agents_error_network_message'),
        suggestion: localize('com_agents_error_network_suggestion'),
      };
    }

    // Handle specific HTTP status codes before generic userMessage
    const status = isErrorObject(error) ? (error as any)?.response?.status : null;
    if (status) {
      if (status === 404) {
        return {
          title: localize('com_agents_error_not_found_title'),
          message: getNotFoundMessage(),
          suggestion: localize('com_agents_error_not_found_suggestion'),
        };
      }

      if (status === 400) {
        return {
          title: localize('com_agents_error_invalid_request'),
          message:
            (errorData as any)?.userMessage || localize('com_agents_error_bad_request_message'),
          suggestion:
            (errorData as any)?.suggestion || localize('com_agents_error_bad_request_suggestion'),
        };
      }

      if (status >= 500) {
        return {
          title: localize('com_agents_error_server_title'),
          message: localize('com_agents_error_server_message'),
          suggestion: localize('com_agents_error_server_suggestion'),
        };
      }
    }

    // Use user-friendly message from backend if available (after specific status code handling)
    if (errorData && typeof errorData === 'object' && (errorData as any)?.userMessage) {
      return {
        title: getContextualTitle(),
        message: (errorData as any).userMessage,
        suggestion:
          (errorData as any).suggestion || localize('com_agents_error_suggestion_generic'),
      };
    }

    // Fallback to generic error with contextual title
    return {
      title: getContextualTitle(),
      message: localize('com_agents_error_generic'),
      suggestion: localize('com_agents_error_suggestion_generic'),
    };
  };

  /**
   * Get contextual title based on current operation
   */
  const getContextualTitle = (): string => {
    if (context?.searchQuery) {
      return localize('com_agents_error_search_title');
    }

    if (context?.category) {
      return localize('com_agents_error_category_title');
    }

    return localize('com_agents_error_title');
  };

  /**
   * Get context-specific not found message
   */
  const getNotFoundMessage = (): string => {
    if (context?.searchQuery) {
      return localize('com_agents_search_no_results', { query: context.searchQuery });
    }

    if (context?.category && context.category !== 'all') {
      return localize('com_agents_category_empty', { category: context.category });
    }

    return localize('com_agents_error_not_found_message');
  };

  const { title, message, suggestion } = getErrorInfo();

  return (
    <div className="py-12 text-center" role="alert" aria-live="assertive" aria-atomic="true">
      <div className="mx-auto max-w-md space-y-4">
        {/* Error icon with proper accessibility */}
        <div className="flex justify-center">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full',
              'bg-red-100 dark:bg-red-900/20',
            )}
          >
            <svg
              className="h-6 w-6 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
              role="img"
              aria-label="Error icon"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
        </div>

        {/* Error content with proper headings and structure */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white" id="error-title">
            {title}
          </h3>
          <p
            className="text-gray-600 dark:text-gray-400"
            id="error-message"
            aria-describedby="error-title"
          >
            {message}
          </p>
          <p
            className="text-sm text-gray-500 dark:text-gray-500"
            id="error-suggestion"
            role="note"
            aria-label={`Suggestion: ${suggestion}`}
          >
            💡 {suggestion}
          </p>
        </div>

        {/* Retry button with enhanced accessibility */}
        {onRetry && (
          <div className="pt-2">
            <Button
              onClick={onRetry}
              variant="outline"
              size="sm"
              className={cn(
                'border-red-300 text-red-700 hover:bg-red-50 focus:ring-2 focus:ring-red-500',
                'dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20 dark:focus:ring-red-400',
              )}
              aria-describedby="error-message error-suggestion"
              aria-label={`Retry action. ${message}`}
            >
              {localize('com_agents_error_retry')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorDisplay;
