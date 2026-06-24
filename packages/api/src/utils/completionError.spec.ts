import { resolveCompletionErrorMessage } from './completionError';

describe('resolveCompletionErrorMessage', () => {
  test('returns default message for null error', () => {
    expect(resolveCompletionErrorMessage(null)).toBe(
      'An error occurred while processing the request',
    );
  });

  test('maps Anthropic overloaded_error payload', () => {
    expect(
      resolveCompletionErrorMessage({
        type: 'error',
        error: { type: 'overloaded_error', message: 'Overloaded' },
        request_id: 'req_011CcLLSSEjZHecBbKRtbwgU',
      }),
    ).toBe('The AI provider is temporarily overloaded. Please wait a moment and try again.');
  });

  test('maps rate_limit_error', () => {
    expect(
      resolveCompletionErrorMessage({
        error: { type: 'rate_limit_error', message: 'Rate limit reached' },
      }),
    ).toBe('Rate limit exceeded. Please wait a moment and try again.');
  });

  test('maps HTTP 529 to overloaded message', () => {
    expect(resolveCompletionErrorMessage({ status: 529, message: 'Overloaded' })).toBe(
      'The AI provider is temporarily overloaded. Please wait a moment and try again.',
    );
  });

  test('maps message-only Overloaded hint', () => {
    expect(resolveCompletionErrorMessage({ message: 'Overloaded' })).toBe(
      'The AI provider is temporarily overloaded. Please wait a moment and try again.',
    );
  });

  test('parses JSON error message', () => {
    expect(
      resolveCompletionErrorMessage({
        message: JSON.stringify({
          type: 'error',
          error: { type: 'overloaded_error', message: 'Overloaded' },
        }),
      }),
    ).toBe('The AI provider is temporarily overloaded. Please wait a moment and try again.');
  });

  test('appends message for unrecognized errors', () => {
    expect(resolveCompletionErrorMessage({ message: 'Something went wrong' })).toBe(
      'An error occurred while processing the request: Something went wrong',
    );
  });

  test('accepts a custom default message', () => {
    expect(resolveCompletionErrorMessage({ message: 'fail' }, 'Request failed')).toBe(
      'Request failed: fail',
    );
  });
});
